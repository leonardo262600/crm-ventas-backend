require('dotenv').config();
const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const routes = require('./src/routes');
const { initSocket } = require('./src/config/socket');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./src/config/swagger');

const app = express();
const server = http.createServer(app);

// Permitir múltiples orígenes para desarrollo
const CORS_ORIGINS = ['http://localhost:5180', 'http://localhost:5173'];
app.use(cors({ origin: CORS_ORIGINS, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('dev'));

// Archivos estáticos (logos, uploads)
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Rutas API
app.use('/api', routes);

// Swagger docs
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'CRM Ventas API',
  customCss: '.swagger-ui .topbar { background-color: #0f766e; }',
}));

app.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date() }));

app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Error interno del servidor' });
});

const { startRunner } = require('./src/services/workflow_runner');

// Inicializar Socket.io
initSocket(server);

// Iniciar Workflow Runner en segundo plano
startRunner();

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`CRM Ventas API + Socket.io + Workflows corriendo en puerto ${PORT}`));
