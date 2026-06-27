const axios = require('axios');
const db    = require('../config/db');

const ERP_URL     = process.env.ERP_URL;
const ERP_API_KEY = process.env.ERP_API_KEY;

/**
 * Llama al ERP para crear el alumno cuando se cierra una venta (status = 'won').
 * Guarda el resultado en erp_sync_log para auditoría y reintentos.
 *
 * @param {object} oportunidad  - Fila completa de opportunities (con tenant_id, id)
 * @param {object} contacto     - { id, name, email, phone }
 */
const crearAlumnoEnERP = async (oportunidad, contacto) => {
  const logBase = {
    tenant_id:      oportunidad.tenant_id,
    opportunity_id: oportunidad.id,
    contact_email:  contacto.email
  };

  if (!ERP_URL || !ERP_API_KEY) {
    await guardarLog({ ...logBase, status: 'skipped', error_message: 'ERP_URL o ERP_API_KEY no configurados' });
    console.warn('[ERP] ERP_URL o ERP_API_KEY no configurados.');
    return { ok: false, error: 'ERP no configurado' };
  }

  // Dividir nombre en partes (el CRM guarda "name" como campo único)
  const partes          = (contacto.name ?? '').trim().split(' ');
  const nombres         = partes[0] ?? contacto.name;
  const apellidoPaterno = partes[1] ?? '';
  const apellidoMaterno = partes[2] ?? '';

  const payload = {
    email: contacto.email,
    nombres,
    apellidoPaterno,
    apellidoMaterno,
    telefono:         contacto.phone ?? null,
    crmOportunidadId: String(oportunidad.id)
  };

  try {
    const { data } = await axios.post(
      `${ERP_URL}/api/auth/crear-alumno`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key':    ERP_API_KEY
        },
        timeout: 10_000
      }
    );

    await guardarLog({
      ...logBase,
      status:           'ok',
      erp_user_id:      data.userId,
      erp_estudiante_id: data.estudianteId
    });

    console.log(`[ERP] Alumno creado: userId=${data.userId} estudianteId=${data.estudianteId}`);
    return { ok: true, data };

  } catch (err) {
    const status  = err.response?.status;
    const message = err.response?.data?.message ?? err.message;

    // 409 = ya existe → no es error, el alumno ya tiene acceso
    if (status === 409) {
      await guardarLog({
        ...logBase,
        status:      'ok',
        erp_user_id: err.response.data?.userId ?? null,
        error_message: 'Alumno ya existía en el ERP'
      });
      console.log(`[ERP] Alumno ya existe. Venta registrada sin re-crear.`);
      return { ok: true, data: err.response.data };
    }

    await guardarLog({ ...logBase, status: 'error', error_message: `${status}: ${message}` });
    console.error(`[ERP] Error al crear alumno: ${status} ${message}`);
    return { ok: false, error: message };
  }
};

async function guardarLog({ tenant_id, opportunity_id, contact_email, status, erp_user_id, erp_estudiante_id, error_message }) {
  try {
    await db.query(
      `INSERT INTO erp_sync_log (tenant_id, opportunity_id, contact_email, status, erp_user_id, erp_estudiante_id, error_message)
       VALUES (?,?,?,?,?,?,?)`,
      [tenant_id, opportunity_id, contact_email, status, erp_user_id ?? null, erp_estudiante_id ?? null, error_message ?? null]
    );
  } catch (e) {
    console.error('[ERP] No se pudo guardar en erp_sync_log:', e.message);
  }
}

module.exports = { crearAlumnoEnERP };