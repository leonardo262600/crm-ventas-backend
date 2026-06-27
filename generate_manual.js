const fs = require('fs');
const PDFDocument = require('pdfkit');

const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
const outputStream = fs.createWriteStream('../Manual_CRM_Ventas.pdf');
doc.pipe(outputStream);

// Colores
const primary = '#0f766e'; // Teal 700
const dark = '#1e293b';
const text = '#334155';
const light = '#f8fafc';
const gray = '#64748b';

// Helper function para titulos
const h1 = (text_content) => {
  doc.moveDown(2);
  doc.fontSize(22).font('Helvetica-Bold').fillColor(primary).text(text_content);
  doc.moveDown(0.5);
};

const h2 = (text_content) => {
  doc.moveDown(1);
  doc.fontSize(16).font('Helvetica-Bold').fillColor(dark).text(text_content);
  doc.moveDown(0.5);
};

const h3 = (text_content) => {
  doc.moveDown(0.5);
  doc.fontSize(12).font('Helvetica-Bold').fillColor(dark).text(text_content);
  doc.moveDown(0.2);
};

const p = (text_content) => {
  doc.fontSize(10).font('Helvetica').fillColor(text).text(text_content, { align: 'justify', lineGap: 3 });
  doc.moveDown(0.5);
};

const code = (text_content) => {
  doc.rect(50, doc.y, 495, 20).fill('#f1f5f9');
  doc.fontSize(10).font('Courier').fillColor('#0f172a').text(text_content, 55, doc.y + 5);
  doc.x = 50;
  doc.moveDown(1);
};

// --- PORTADA ---
doc.rect(0, 0, 612, 792).fill(primary);
doc.fontSize(40).font('Helvetica-Bold').fillColor('white').text('CRM VENTAS', 0, 300, { align: 'center' });
doc.fontSize(18).font('Helvetica').fillColor('#ccfbf1').text('Manual Técnico y Guía de Despliegue', 0, 350, { align: 'center' });
doc.fontSize(12).fillColor('white').text(`Generado el: ${new Date().toLocaleDateString('es-PE')}`, 0, 700, { align: 'center' });
doc.addPage();

// --- PAGINA 1: INTRO Y TECNOLOGIAS ---
h1('1. Especificaciones Tecnológicas');
p('El CRM Ventas ha sido desarrollado utilizando un stack tecnológico moderno basado enteramente en Javascript, garantizando un alto rendimiento, escalabilidad y una experiencia de usuario en tiempo real.');

h2('Frontend (Panel de Usuario)');
p('• Framework Core: React.js v18');
p('• Compilador/Bundler: Vite (Ofrece tiempos de carga y desarrollo ultra-rápidos).');
p('• Enrutamiento: React Router DOM v6.');
p('• Diseño y Estilos: CSS Puro Modular, utilizando un sistema de diseño propio inspirado en Glassmorphism y diseño corporativo plano.');
p('• Íconos: Lucide React.');
p('• Gráficos y Dashboard: Recharts (Para visualización de datos estadísticos).');
p('• Exportaciones: XLSX (Excel) y jsPDF (PDF) procesadas 100% en el lado del cliente.');

h2('Backend (Servidor y API)');
p('• Entorno: Node.js.');
p('• Framework API: Express.js.');
p('• Base de Datos: MySQL v8.');
p('• Autenticación: JSON Web Tokens (JWT) con encriptación bcrypt para contraseñas.');
p('• Seguridad 2FA: Autenticador de Dos Factores utilizando "otplib" y "qrcode".');
p('• Generación de PDF Fiscales: pdfkit (Renderizado directo en servidor para facturas inmutables).');

// --- PAGINA 2: FUNCIONALIDADES ---
h1('2. Módulos y Funcionalidades Principales');
p('El sistema es un ERP modular diseñado para pequeñas y medianas empresas.');

h3('A. Dashboard Gerencial');
p('Panel visual interactivo que muestra las oportunidades mensuales (Gráfico de Área), distribución del pipeline (Gráfico Circular y de Barras), ingresos totales, y actividades pendientes.');

h3('B. Gestión de Contactos (CRM Core)');
p('Directorio de prospectos y clientes. Permite importación masiva mediante archivos CSV y exportación a Excel/PDF. Incluye una ficha 360° para ver todo el historial de un cliente en un solo lugar.');

h3('C. Pipeline de Oportunidades (Kanban)');
p('Tablero interactivo "Drag & Drop" (Arrastrar y soltar) para gestionar las negociaciones en sus diferentes etapas (Prospecto, Calificado, Propuesta, Negociación). Calcula automáticamente la probabilidad de cierre y monto.');

h3('D. Catálogo y Listas de Precio');
p('Inventario de productos. Permite crear infinitas listas de precio dinámicas (Ej. Mayorista, Minorista) asociadas a múltiples monedas y establecer márgenes de rentabilidad.');

h3('E. Cotizaciones y Facturación');
p('Generador de cotizaciones en PDF. Las cotizaciones pueden ser aprobadas y transformadas directamente en facturas con un solo clic.');

h3('F. Reportes Analíticos');
p('Motor robusto para descargar reportes gerenciales en PDF y Excel, filtrando tendencias de ingresos mensuales y ranking de los mejores vendedores.');

doc.addPage();

// --- PAGINA 3: INSTALACION LOCAL ---
h1('3. Instalación Local (Paso a Paso)');
p('Sigue estas instrucciones para ejecutar el código fuente en una computadora nueva para desarrollo o uso interno en una red local.');

h2('Paso 3.1: Requisitos Previos');
p('1. Descarga e instala Node.js (versión 18 o superior) desde nodejs.org');
p('2. Descarga e instala XAMPP u otro servidor local que contenga MySQL.');
p('3. Inicia el módulo de MySQL desde el panel de control de XAMPP.');

h2('Paso 3.2: Base de Datos');
p('1. Abre tu navegador y ve a localhost/phpmyadmin');
p('2. Crea una nueva base de datos llamada "crm_ventas".');
p('3. El sistema creará automáticamente las tablas al iniciar la aplicación.');

h2('Paso 3.3: Configurar el Backend (Servidor)');
p('1. Abre la carpeta del proyecto y ve al directorio "backend".');
p('2. Renombra el archivo ".env.example" a ".env".');
p('3. Edita el archivo ".env" asegurándote de que las credenciales de BD coincidan:');
code('DB_NAME=crm_ventas\nDB_USER=root\nDB_PASS=');
p('4. Abre la terminal en la carpeta backend y ejecuta la instalación de paquetes:');
code('npm install');
p('5. Inicia el servidor de desarrollo:');
code('npm run dev');
p('El backend estará corriendo en el puerto 3000.');

h2('Paso 3.4: Configurar el Frontend (Panel Visual)');
p('1. Abre una nueva terminal en el directorio "frontend".');
p('2. Instala los paquetes:');
code('npm install');
p('3. Inicia la aplicación React:');
code('npm run dev');
p('El navegador se abrirá automáticamente en localhost:5173.');

doc.addPage();

// --- PAGINA 4: DEPLOYMENT NUBE ---
h1('4. Despliegue en la Nube (Hosting)');
p('Debido a la arquitectura moderna (Javascript full-stack), NO se recomienda un cPanel tradicional. La arquitectura recomendada y más económica para este sistema es: Render (Backend) + Vercel (Frontend).');

h2('Paso 4.1: Subir código a GitHub');
p('Sube tu carpeta "backend" y "frontend" a dos repositorios privados distintos en GitHub.');

h2('Paso 4.2: Desplegar Base de Datos y Backend (Render.com)');
p('1. Crea una cuenta gratuita en Render.com');
p('2. Ve a "New" -> "MySQL" o "PostgreSQL" (Se recomienda Aiven o TiDB serverless si Render no tiene capa gratuita de MySQL actualmente).');
p('3. Copia la URL de conexión de la base de datos recién creada.');
p('4. En Render, ve a "New" -> "Web Service". Conecta tu repositorio de GitHub del Backend.');
p('5. Configura el servicio: \n   - Build Command: npm install\n   - Start Command: node server.js');
p('6. En la pestaña "Environment", añade las variables de entorno (.env) como DB_HOST, DB_USER, DB_PASS, DB_NAME (usando los datos del paso 2) y JWT_SECRET.');
p('7. Haz clic en Deploy. Tu API ahora será accesible en internet (ej: crm-api.onrender.com).');

h2('Paso 4.3: Desplegar Frontend (Vercel.com)');
p('1. Crea una cuenta en Vercel.com');
p('2. Haz clic en "Add New" -> "Project".');
p('3. Importa tu repositorio de GitHub del Frontend.');
p('4. Vercel detectará automáticamente que es un proyecto Vite/React.');
p('5. En la sección "Environment Variables", añade la URL de tu backend:');
code('VITE_API_URL=https://crm-api.onrender.com/api');
p('6. Haz clic en Deploy.');
p('7. En segundos, Vercel te entregará una URL pública (ej: mi-crm.vercel.app) con certificado SSL gratuito instalado.');

h2('¡Felicidades!');
p('Tu sistema CRM ahora está en vivo en internet, operando bajo una arquitectura cloud robusta, escalable y segura.');

// --- FOOTER GLOBALS ---
const range = doc.bufferedPageRange();
for (let i = 0; i < range.count; i++) {
  doc.switchToPage(i);
  if (i > 0) { // No footer on cover
    doc.fontSize(8).fillColor(gray).text(`CRM Ventas - Manual Técnico | Página ${i}`, 50, 780, { align: 'center' });
  }
}

doc.end();

console.log('PDF Generado correctamente.');
