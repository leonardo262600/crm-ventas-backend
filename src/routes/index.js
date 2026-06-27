const router = require('express').Router();
const { auth, requireRole } = require('../middleware/auth');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

const authCtrl       = require('../controllers/auth.controller');
const usersCtrl      = require('../controllers/users.controller');
const contactsCtrl   = require('../controllers/contacts.controller');
const oppsCtrl       = require('../controllers/opportunities.controller');
const activitiesCtrl = require('../controllers/activities.controller');
const productsCtrl   = require('../controllers/products.controller');
const quotesCtrl     = require('../controllers/quotes.controller');
const reportsCtrl    = require('../controllers/reports.controller');
const commCtrl       = require('../controllers/communications.controller');
const automCtrl      = require('../controllers/automations.controller');
const adminCtrl      = require('../controllers/admin.controller');
const importCtrl     = require('../controllers/import.controller');
const exportsCtrl    = require('../controllers/exports.controller');
const priceCtrl      = require('../controllers/pricelists.controller');
// ── Integración Academia Online ─────────────────────────────
const academiaWebhookCtrl = require('../../academiaWebhook.controller');
const chatCtrl       = require('../controllers/chat.controller');
const profileCtrl    = require('../controllers/profile.controller');
const settingsCtrl   = require('../controllers/settings.controller');

// Multer storage para logos
const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../public/uploads/logos');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `logo-${req.user.tenant_id}-${Date.now()}${ext}`);
  },
});
const logoUpload = multer({
  storage: logoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg','image/png','image/gif','image/webp','image/svg+xml'];
    cb(null, allowed.includes(file.mimetype));
  },
});

// ── Auth ─────────────────────────────────────────────────
router.post('/auth/login',    authCtrl.login);
router.get('/auth/me',        auth, authCtrl.me);
router.put('/auth/password',  auth, authCtrl.changePassword);

// ── Profile ───────────────────────────────────────────────
router.get('/profile',               auth, profileCtrl.getProfile);
router.put('/profile',               auth, profileCtrl.updateProfile);
router.put('/profile/password',      auth, profileCtrl.changePassword);
router.get('/profile/stats',         auth, profileCtrl.getStats);

// ── 2FA ───────────────────────────────────────────────────
router.get('/auth/2fa/setup',        auth, authCtrl.setup2FA);
router.post('/auth/2fa/enable',      auth, authCtrl.enable2FA);
router.post('/auth/2fa/disable',     auth, authCtrl.disable2FA);


// ── Users ─────────────────────────────────────────────────
router.get('/users',        auth, requireRole('admin','gerente'), usersCtrl.list);
router.post('/users',       auth, requireRole('admin'),           usersCtrl.create);
router.put('/users/:id',    auth, requireRole('admin'),           usersCtrl.update);
router.delete('/users/:id', auth, requireRole('admin'),           usersCtrl.remove);

// ── Contacts ──────────────────────────────────────────────

router.get('/contacts',        auth, contactsCtrl.list);
router.get('/contacts/:id',    auth, contactsCtrl.getOne);
router.post('/contacts',       auth, contactsCtrl.create);
router.put('/contacts/:id',    auth, contactsCtrl.update);
router.delete('/contacts/:id', auth, requireRole('admin','gerente'), contactsCtrl.remove);

// ── Endpoint para notificaciones de la Academia (NO requiere auth, usa API Key) ──
router.post(
  '/contacts/from-academia',
  academiaWebhookCtrl.requireApiKey,
  academiaWebhookCtrl.fromAcademia
);

// ── Opportunities ─────────────────────────────────────────
router.get('/opportunities',                auth, oppsCtrl.list);
router.get('/opportunities/stages',         auth, oppsCtrl.stages);
router.get('/opportunities/forecast',       auth, oppsCtrl.forecast);
router.get('/opportunities/:id',            auth, oppsCtrl.getOne);
router.post('/opportunities',               auth, oppsCtrl.create);
router.put('/opportunities/:id',            auth, oppsCtrl.update);
router.patch('/opportunities/:id/stage',    auth, oppsCtrl.moveStage);
router.patch('/opportunities/:id/status',   auth, oppsCtrl.updateStatus);
router.delete('/opportunities/:id',         auth, requireRole('admin','gerente'), oppsCtrl.remove);

// ── Activities ────────────────────────────────────────────
router.get('/activities',              auth, activitiesCtrl.list);
router.post('/activities',             auth, activitiesCtrl.create);
router.put('/activities/:id',          auth, activitiesCtrl.update);
router.patch('/activities/:id/complete', auth, activitiesCtrl.complete);
router.delete('/activities/:id',       auth, activitiesCtrl.remove);

// ── Products ──────────────────────────────────────────────
router.get('/products',        auth, productsCtrl.list);
router.post('/products',       auth, requireRole('admin','gerente'), productsCtrl.create);
router.put('/products/:id',    auth, requireRole('admin','gerente'), productsCtrl.update);
router.delete('/products/:id', auth, requireRole('admin'),           productsCtrl.remove);

// ── Price Lists ───────────────────────────────────────────
router.get('/price-lists',                          auth, priceCtrl.list);
router.get('/price-lists/:id',                      auth, priceCtrl.getOne);
router.post('/price-lists',                         auth, requireRole('admin','gerente'), priceCtrl.create);
router.put('/price-lists/:id',                      auth, requireRole('admin','gerente'), priceCtrl.update);
router.delete('/price-lists/:id',                   auth, requireRole('admin'),           priceCtrl.remove);
router.post('/price-lists/:id/items',               auth, requireRole('admin','gerente'), priceCtrl.setItem);
router.delete('/price-lists/:id/items/:product_id', auth, requireRole('admin','gerente'), priceCtrl.removeItem);
router.get('/price-lists/:id/calc',                 auth, priceCtrl.calcVolumePrice);


// ── Quotes ────────────────────────────────────────────────
router.get('/quotes',              auth, quotesCtrl.list);
router.get('/quotes/:id',          auth, quotesCtrl.getOne);
router.post('/quotes',             auth, quotesCtrl.create);
router.put('/quotes/:id',          auth, quotesCtrl.update);
router.patch('/quotes/:id/status', auth, quotesCtrl.updateStatus);

// ── Invoices ──────────────────────────────────────────────
const invoicesCtrl = require('../controllers/invoices.controller');
router.get('/invoices',              auth, invoicesCtrl.list);
router.get('/invoices/:id',          auth, invoicesCtrl.getOne);
router.post('/invoices/from-quote',  auth, invoicesCtrl.createFromQuote);
router.patch('/invoices/:id/status', auth, invoicesCtrl.updateStatus);
router.get('/invoices/:id/pdf',      auth, invoicesCtrl.downloadPDF);

// ── Reports ───────────────────────────────────────────────
router.get('/reports/dashboard', auth, reportsCtrl.dashboard);
router.get('/reports/funnel',    auth, reportsCtrl.salesFunnel);

// ── Communications ────────────────────────────────────────
router.get('/communications/emails',          auth, commCtrl.listEmails);
router.post('/communications/emails',         auth, commCtrl.createEmail);
router.get('/communications/calls',           auth, commCtrl.listCalls);
router.post('/communications/calls',          auth, commCtrl.createCall);
router.get('/communications/templates',       auth, commCtrl.listTemplates);
router.post('/communications/templates',      auth, commCtrl.createTemplate);
router.put('/communications/templates/:id',   auth, commCtrl.updateTemplate);
router.delete('/communications/templates/:id',auth, commCtrl.deleteTemplate);

// ── Chat (REST history) ───────────────────────────────────
router.get('/chat/rooms',   auth, chatCtrl.getRooms);
router.get('/chat/history', auth, chatCtrl.getHistory);

// ── Automations ───────────────────────────────────────────
router.get('/automations',            auth, automCtrl.list);
router.post('/automations',           auth, requireRole('admin','gerente'), automCtrl.create);
router.put('/automations/:id',        auth, requireRole('admin','gerente'), automCtrl.update);
router.patch('/automations/:id/toggle', auth, requireRole('admin','gerente'), automCtrl.toggle);
router.delete('/automations/:id',     auth, requireRole('admin'),           automCtrl.remove);

// ── Notifications (Web Push) ──────────────────────────────
const notifCtrl = require('../controllers/notifications.controller');
router.post('/notifications/subscribe', auth, notifCtrl.subscribe);
router.post('/notifications/test',      auth, notifCtrl.sendTestNotification);

// ── Workflows (Visual Builder) ────────────────────────────
const workflowsCtrl = require('../controllers/workflows.controller');
router.get('/workflows',              auth, workflowsCtrl.list);
router.get('/workflows/:id',          auth, workflowsCtrl.getOne);
router.post('/workflows',             auth, requireRole('admin','gerente'), workflowsCtrl.create);
router.put('/workflows/:id',          auth, requireRole('admin','gerente'), workflowsCtrl.update);
router.patch('/workflows/:id/toggle', auth, requireRole('admin','gerente'), workflowsCtrl.toggle);
router.delete('/workflows/:id',       auth, requireRole('admin'),           workflowsCtrl.remove);

// ── Admin ─────────────────────────────────────────────────
router.get('/admin/audit',                      auth, requireRole('admin'),           adminCtrl.auditLog);
router.get('/admin/stats',                      auth, requireRole('admin','gerente'), adminCtrl.stats);
router.get('/admin/settings',                   auth, requireRole('admin','gerente'), adminCtrl.getSettings);
router.post('/admin/settings',                  auth, requireRole('admin'),           adminCtrl.saveSettings);
router.get('/admin/pipeline-stages',            auth, adminCtrl.getStages);
router.post('/admin/pipeline-stages',           auth, requireRole('admin','gerente'), adminCtrl.createStage);
router.put('/admin/pipeline-stages/:id',        auth, requireRole('admin','gerente'), adminCtrl.updateStage);
router.delete('/admin/pipeline-stages/:id',     auth, requireRole('admin'),           adminCtrl.deleteStage);
router.post('/admin/backup',                    auth, requireRole('admin'),           adminCtrl.runBackup);
router.get('/admin/backups',                    auth, requireRole('admin'),           adminCtrl.listBackups);
router.get('/admin/backups/:filename/download', auth, requireRole('admin'),           adminCtrl.downloadBackup);

// ── Aceptación pública de cotizaciones (sin auth) ────────
const quotesCtrlPublic = require('../controllers/quotes.controller');
router.get('/public/quotes/:token',             quotesCtrlPublic.getPublic);
router.post('/public/quotes/:token/accept',     quotesCtrlPublic.acceptPublic);
router.post('/public/quotes/:token/reject',     quotesCtrlPublic.rejectPublic);

// ── Import / Export ───────────────────────────────────────
router.post('/import/contacts',              auth, requireRole('admin','gerente'), importCtrl.importContacts);
router.get('/exports/contacts/excel',        auth, exportsCtrl.exportContactsExcel);
router.get('/exports/opportunities/excel',   auth, exportsCtrl.exportOppsExcel);
router.get('/exports/quotes/:id/pdf',        auth, exportsCtrl.exportQuotePDF);
router.get('/exports/report/excel',          auth, requireRole('admin','gerente'), exportsCtrl.exportReportExcel);
router.get('/exports/report/pdf',            auth, requireRole('admin','gerente'), exportsCtrl.exportReportPDF);

// ── Settings (Configuración empresa) ─────────────────────
router.get('/settings',              auth, requireRole('admin','gerente'), settingsCtrl.getSettings);
router.put('/settings',              auth, requireRole('admin'),           settingsCtrl.saveSettings);
router.post('/settings/logo',        auth, requireRole('admin'), logoUpload.single('logo'), settingsCtrl.uploadLogo);
router.delete('/settings/logo',      auth, requireRole('admin'),           settingsCtrl.deleteLogo);

// ── Backup / Restauración / Reset ─────────────────────────
const backupCtrl = require('../controllers/backup.controller');

// Multer para restaurar desde archivo SQL subido
const sqlStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../tmp_restore');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `restore-${Date.now()}.sql`),
});
const sqlUpload = multer({
  storage: sqlStorage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
  fileFilter: (req, file, cb) => cb(null, file.originalname.endsWith('.sql')),
});

router.get('/backup/info',                  auth, requireRole('admin'),           backupCtrl.info);
router.get('/backup/list',                  auth, requireRole('admin'),           backupCtrl.list);
router.post('/backup/generate',             auth, requireRole('admin'),           backupCtrl.generate);
router.get('/backup/download/:filename',    auth, requireRole('admin'),           backupCtrl.download);
router.delete('/backup/:filename',          auth, requireRole('admin'),           backupCtrl.remove);
router.post('/backup/restore/:filename',    auth, requireRole('admin'),           backupCtrl.restoreFromFile);
router.post('/backup/restore/upload',       auth, requireRole('admin'), sqlUpload.single('sqlfile'), backupCtrl.restoreFromUpload);
router.post('/backup/reset',               auth, requireRole('admin'),           backupCtrl.resetSystem);

module.exports = router;


