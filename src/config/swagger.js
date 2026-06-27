const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'CRM Ventas API',
      version: '1.0.0',
      description: 'API REST del sistema CRM de ventas. Autenticación con Bearer JWT.',
    },
    servers: [{ url: 'http://localhost:5000/api', description: 'Desarrollo' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
      }
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Auth',           description: 'Autenticación y sesión' },
      { name: 'Contactos',      description: 'Gestión de contactos y clientes' },
      { name: 'Oportunidades',  description: 'Pipeline de ventas' },
      { name: 'Actividades',    description: 'Tareas, reuniones y llamadas' },
      { name: 'Cotizaciones',   description: 'Cotizaciones y ventas' },
      { name: 'Productos',      description: 'Catálogo de productos' },
      { name: 'Comunicaciones', description: 'Emails, llamadas y plantillas' },
      { name: 'Reportes',       description: 'Dashboard y métricas' },
      { name: 'Exportaciones',  description: 'Excel y PDF' },
      { name: 'Automatizaciones', description: 'Workflows automáticos' },
      { name: 'Admin',          description: 'Administración del sistema' },
    ],
    paths: {
      '/auth/login': {
        post: {
          tags: ['Auth'], summary: 'Iniciar sesión',
          security: [],
          requestBody: { required: true, content: { 'application/json': { schema: { type:'object', properties: { email:{type:'string',example:'admin@crm.com'}, password:{type:'string',example:'admin123'} }, required:['email','password'] }}}},
          responses: { 200: { description: 'Token JWT y datos del usuario' }, 401: { description: 'Credenciales inválidas' } }
        }
      },
      '/auth/me': { get: { tags:['Auth'], summary:'Obtener usuario autenticado', responses:{ 200:{description:'Datos del usuario'} } } },
      '/contacts': {
        get: { tags:['Contactos'], summary:'Listar contactos', parameters:[{in:'query',name:'search',schema:{type:'string'}},{in:'query',name:'tag',schema:{type:'string'}}], responses:{200:{description:'Lista de contactos'}} },
        post: { tags:['Contactos'], summary:'Crear contacto', requestBody:{required:true,content:{'application/json':{schema:{type:'object',properties:{name:{type:'string'},email:{type:'string'},phone:{type:'string'},company:{type:'string'}},required:['name']}}}}, responses:{201:{description:'Contacto creado'}} }
      },
      '/contacts/{id}': {
        get:    { tags:['Contactos'], summary:'Obtener contacto con historial 360°', parameters:[{in:'path',name:'id',required:true,schema:{type:'integer'}}], responses:{200:{description:'Ficha completa'}} },
        put:    { tags:['Contactos'], summary:'Actualizar contacto', parameters:[{in:'path',name:'id',required:true,schema:{type:'integer'}}], responses:{200:{description:'Actualizado'}} },
        delete: { tags:['Contactos'], summary:'Eliminar contacto', parameters:[{in:'path',name:'id',required:true,schema:{type:'integer'}}], responses:{200:{description:'Eliminado'}} }
      },
      '/opportunities': {
        get:  { tags:['Oportunidades'], summary:'Listar oportunidades', parameters:[{in:'query',name:'stage_id',schema:{type:'integer'}},{in:'query',name:'status',schema:{type:'string',enum:['open','won','lost']}}], responses:{200:{description:'Lista'}} },
        post: { tags:['Oportunidades'], summary:'Crear oportunidad', responses:{201:{description:'Creada'}} }
      },
      '/opportunities/stages': { get:{ tags:['Oportunidades'], summary:'Listar etapas del pipeline', responses:{200:{description:'Etapas'}} } },
      '/opportunities/{id}/stage': { patch:{ tags:['Oportunidades'], summary:'Mover oportunidad de etapa (Kanban)', parameters:[{in:'path',name:'id',required:true,schema:{type:'integer'}}], responses:{200:{description:'Etapa actualizada'}} } },
      '/activities': {
        get:  { tags:['Actividades'], summary:'Listar actividades', parameters:[{in:'query',name:'status',schema:{type:'string'}},{in:'query',name:'type',schema:{type:'string'}},{in:'query',name:'from',schema:{type:'string',format:'date'}},{in:'query',name:'to',schema:{type:'string',format:'date'}}], responses:{200:{description:'Lista'}} },
        post: { tags:['Actividades'], summary:'Crear actividad', responses:{201:{description:'Creada'}} }
      },
      '/activities/{id}/complete': { patch:{ tags:['Actividades'], summary:'Marcar actividad como completada', parameters:[{in:'path',name:'id',required:true,schema:{type:'integer'}}], responses:{200:{description:'Completada'}} } },
      '/quotes': {
        get:  { tags:['Cotizaciones'], summary:'Listar cotizaciones', responses:{200:{description:'Lista'}} },
        post: { tags:['Cotizaciones'], summary:'Crear cotización con ítems', responses:{201:{description:'Creada'}} }
      },
      '/quotes/{id}': { get:{ tags:['Cotizaciones'], summary:'Obtener cotización con ítems', parameters:[{in:'path',name:'id',required:true,schema:{type:'integer'}}], responses:{200:{description:'Cotización completa'}} } },
      '/products': {
        get:  { tags:['Productos'], summary:'Listar productos', parameters:[{in:'query',name:'search',schema:{type:'string'}},{in:'query',name:'category',schema:{type:'string'}}], responses:{200:{description:'Lista'}} },
        post: { tags:['Productos'], summary:'Crear producto', responses:{201:{description:'Creado'}} }
      },
      '/reports/dashboard': { get:{ tags:['Reportes'], summary:'Dashboard ejecutivo con KPIs, gráficas y actividades próximas', responses:{200:{description:'Datos del dashboard'}} } },
      '/exports/contacts/excel':     { get:{ tags:['Exportaciones'], summary:'Exportar contactos a Excel', responses:{200:{description:'Archivo .xlsx'}} } },
      '/exports/opportunities/excel':{ get:{ tags:['Exportaciones'], summary:'Exportar oportunidades a Excel', responses:{200:{description:'Archivo .xlsx'}} } },
      '/exports/report/excel':       { get:{ tags:['Exportaciones'], summary:'Reporte completo a Excel (3 hojas)', responses:{200:{description:'Archivo .xlsx'}} } },
      '/exports/quotes/{id}/pdf':    { get:{ tags:['Exportaciones'], summary:'Exportar cotización a PDF', parameters:[{in:'path',name:'id',required:true,schema:{type:'integer'}}], responses:{200:{description:'Archivo .pdf'}} } },
      '/automations': {
        get:  { tags:['Automatizaciones'], summary:'Listar workflows', responses:{200:{description:'Lista'}} },
        post: { tags:['Automatizaciones'], summary:'Crear workflow', responses:{201:{description:'Creado'}} }
      },
      '/admin/audit':           { get:{ tags:['Admin'], summary:'Log de auditoría', responses:{200:{description:'Registros'}} } },
      '/admin/pipeline-stages': { get:{ tags:['Admin'], summary:'Gestionar etapas del pipeline', responses:{200:{description:'Etapas'}} } },
      '/import/contacts':       { post:{ tags:['Admin'], summary:'Importar contactos desde CSV (JSON rows)', responses:{200:{description:'Resultado de importación'}} } },
    }
  },
  apis: [],
};

module.exports = swaggerJsdoc(options);
