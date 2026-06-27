const db = require('../config/db');
const { processWorkflowJob } = require('./automations.service');

const runWorkflowJobs = async () => {
  try {
    // Buscar trabajos pendientes o "durmiendo" cuyo tiempo de ejecución ya pasó
    const [jobs] = await db.query(
      `SELECT * FROM workflow_jobs 
       WHERE status IN ('pending', 'sleeping') 
         AND (execute_after IS NULL OR execute_after <= NOW())
       ORDER BY created_at ASC LIMIT 50`
    );

    if (jobs.length === 0) return;

    for (const job of jobs) {
      try {
        // Bloquear el trabajo marcándolo temporalmente (o simplemente procesarlo)
        // En producción real, se usaría un lock o estado 'processing' para evitar concurrencia.
        await db.query("UPDATE workflow_jobs SET status='processing' WHERE id=?", [job.id]);
        
        await processWorkflowJob(job);
      } catch (err) {
        console.error(`[WorkflowRunner] Error en trabajo ${job.id}:`, err.message);
        await db.query("UPDATE workflow_jobs SET status='failed' WHERE id=?", [job.id]);
      }
    }
  } catch (err) {
    console.error('[WorkflowRunner] Error:', err.message);
  }
};

const startRunner = () => {
  console.log('[WorkflowRunner] Iniciado...');
  // Ejecutar cada 30 segundos
  setInterval(runWorkflowJobs, 30000);
  // Ejecutar una vez al inicio
  runWorkflowJobs();
};

module.exports = { startRunner };
