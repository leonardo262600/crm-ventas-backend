const db = require('../config/db');
const { sendMail } = require('./email.service');
const { format, addMinutes, addHours, addDays } = require('date-fns');

/**
 * Ejecuta las automatizaciones configuradas para un evento dado.
 * @param {string} triggerType  Tipo de trigger (opportunity_created, etc.)
 * @param {object} context      Datos del evento { tenant_id, record, user_id }
 */
const runAutomations = async (triggerType, context) => {
  try {
    // 1. Ejecutar automatizaciones legacy (simples)
    const [automations] = await db.query(
      "SELECT * FROM automations WHERE tenant_id=? AND trigger_type=? AND active=1",
      [context.tenant_id, triggerType]
    );

    for (const auto of automations) {
      const triggerCfg = safeJson(auto.trigger_config);
      const actionCfg  = safeJson(auto.action_config);

      if (!matchesTrigger(triggerType, triggerCfg, context)) continue;
      await executeAction(auto.action_type, actionCfg, context);
    }

    // 2. Inicializar workflows visuales
    const [workflows] = await db.query(
      "SELECT * FROM workflows WHERE tenant_id=? AND trigger_type=? AND active=1",
      [context.tenant_id, triggerType]
    );

    for (const wf of workflows) {
      const nodes = safeJson(wf.nodes_json) || [];
      const edges = safeJson(wf.edges_json) || [];
      
      // Encontrar el nodo trigger (raíz)
      const triggerNode = nodes.find(n => n.type === 'triggerNode');
      if (!triggerNode) continue;
      
      // Encontrar el siguiente nodo conectado al trigger
      const nextEdge = edges.find(e => e.source === triggerNode.id);
      if (!nextEdge) continue; // Termina ahí
      
      const recordType = determineRecordType(triggerType);
      
      // Insertar un job para empezar en el siguiente nodo
      await db.query(
        `INSERT INTO workflow_jobs (tenant_id, workflow_id, record_type, record_id, current_node_id, state_data, status)
         VALUES (?,?,?,?,?,?,'pending')`,
        [context.tenant_id, wf.id, recordType, context.record?.id || null, nextEdge.target, JSON.stringify(context)]
      );
    }

  } catch (err) {
    console.error('[Automatizaciones] Error:', err.message);
  }
};

const determineRecordType = (trigger) => {
  if (trigger.includes('opportunity')) return 'opportunity';
  if (trigger.includes('contact')) return 'contact';
  if (trigger.includes('quote')) return 'quote';
  if (trigger.includes('activity')) return 'activity';
  return 'general';
};

const safeJson = (val) => {
  if (!val) return {};
  try { return typeof val === 'string' ? JSON.parse(val) : val; }
  catch { return {}; }
};

const matchesTrigger = (type, cfg, ctx) => {
  if (type === 'opportunity_stage_changed' && cfg.to_stage) {
    return String(ctx.record?.stage_id) === String(cfg.to_stage);
  }
  return true;
};

const executeAction = async (actionType, cfg, ctx) => {
  const { tenant_id, record, user_id } = ctx;

  switch (actionType) {
    case 'create_activity': {
      const title = cfg.title || 'Actividad automática';
      const type  = cfg.type  || 'tarea';
      await db.query(
        `INSERT INTO activities (tenant_id, title, type, contact_id, opportunity_id, assigned_to, created_by, status)
         VALUES (?,?,?,?,?,?,?,'pendiente')`,
        [tenant_id, title, type,
         record?.contact_id || null,
         record?.id         || null,
         record?.assigned_to || user_id,
         user_id]
      );
      break;
    }

    case 'assign_user': {
      if (!cfg.user_id || !record?.id) break;
      // Solo aplica a oportunidades
      await db.query(
        'UPDATE opportunities SET assigned_to=? WHERE id=? AND tenant_id=?',
        [cfg.user_id, record.id, tenant_id]
      );
      break;
    }

    case 'change_stage': {
      if (!cfg.stage_id || !record?.id) break;
      await db.query(
        'UPDATE opportunities SET stage_id=? WHERE id=? AND tenant_id=?',
        [cfg.stage_id, record.id, tenant_id]
      );
      break;
    }

    case 'send_email': {
      // Registra el email en comm_emails
      const subject = cfg.subject || 'Notificación automática';
      const body    = buildEmailBody(cfg.body || '', record);
      await db.query(
        'INSERT INTO comm_emails (tenant_id, contact_id, subject, body, user_id) VALUES (?,?,?,?,?)',
        [tenant_id, record?.contact_id || null, subject, body, user_id]
      );
      // Intentar envío real si el contacto tiene email
      if (record?.contact_id) {
        const [contacts] = await db.query('SELECT email FROM contacts WHERE id=?', [record.contact_id]);
        if (contacts.length && contacts[0].email) {
          sendMail({ to: contacts[0].email, subject, html: body })
            .catch(err => console.error('[Automatización/Email] Error:', err.message));
        }
      }
      break;
    }
  }
};

const buildEmailBody = (template, record) => {
  if (!template || !record) return template;
  return template
    .replace(/\{\{nombre\}\}/gi, record.name || record.title || '')
    .replace(/\{\{empresa\}\}/gi, record.company || '')
    .replace(/\{\{monto\}\}/gi,   record.amount  || '');
};

const processWorkflowJob = async (job) => {
  const { id, tenant_id, workflow_id, current_node_id, state_data } = job;
  const ctx = safeJson(state_data);

  // 1. Cargar el workflow
  const [wfs] = await db.query('SELECT nodes_json, edges_json FROM workflows WHERE id=?', [workflow_id]);
  if (!wfs.length) {
    await db.query("UPDATE workflow_jobs SET status='completed' WHERE id=?", [id]);
    return;
  }

  const nodes = safeJson(wfs[0].nodes_json) || [];
  const edges = safeJson(wfs[0].edges_json) || [];

  const currentNode = nodes.find(n => n.id === current_node_id);
  if (!currentNode) {
    await db.query("UPDATE workflow_jobs SET status='completed' WHERE id=?", [id]);
    return;
  }

  // 2. Procesar el nodo según su tipo
  let nextExecuteAfter = null;

  if (currentNode.type === 'actionNode') {
    const actionType = currentNode.data?.action_type;
    const actionCfg  = currentNode.data?.action_config || {};
    if (actionType) await executeAction(actionType, actionCfg, ctx);
  } else if (currentNode.type === 'delayNode') {
    // Si es delay, actualizamos el execute_after del job y lo dormimos.
    const delayType = currentNode.data?.delay_type || 'minutes';
    const delayVal  = Number(currentNode.data?.delay_value) || 1;
    
    let nextDate = new Date();
    if (delayType === 'minutes') nextDate = addMinutes(nextDate, delayVal);
    else if (delayType === 'hours') nextDate = addHours(nextDate, delayVal);
    else if (delayType === 'days') nextDate = addDays(nextDate, delayVal);
    
    nextExecuteAfter = nextDate;
  }

  // 3. Determinar el siguiente paso
  if (nextExecuteAfter) {
    // Nos vamos a dormir
    const nextEdge = edges.find(e => e.source === current_node_id);
    if (!nextEdge) {
      await db.query("UPDATE workflow_jobs SET status='completed' WHERE id=?", [id]);
    } else {
      await db.query(
        "UPDATE workflow_jobs SET status='sleeping', current_node_id=?, execute_after=? WHERE id=?",
        [nextEdge.target, nextExecuteAfter, id]
      );
    }
  } else {
    // Avanzar de inmediato al siguiente
    const nextEdge = edges.find(e => e.source === current_node_id);
    if (nextEdge) {
      await db.query(
        "UPDATE workflow_jobs SET status='pending', current_node_id=? WHERE id=?",
        [nextEdge.target, id]
      );
      // Opcional: recursividad (o dejar que el runner lo vuelva a pillar en el sgte ciclo)
    } else {
      await db.query("UPDATE workflow_jobs SET status='completed' WHERE id=?", [id]);
    }
  }
};

module.exports = { runAutomations, processWorkflowJob };
