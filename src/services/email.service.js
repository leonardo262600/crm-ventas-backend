const nodemailer = require('nodemailer');

/**
 * Envía un email real usando las variables SMTP del .env.
 * Si SMTP_HOST no está configurado, solo hace log y no lanza error.
 */
const sendMail = async ({ to, subject, html, text }) => {
  if (!process.env.SMTP_HOST) {
    console.log(`[Email] SMTP no configurado. Simulando envío a: ${to} | Asunto: ${subject}`);
    return { simulated: true };
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true', // true para 465, false para otros
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text: text || '',
      html: html || text || '',
    });

    console.log(`[Email] Enviado con éxito: ${info.messageId} → ${to}`);
    return info;
  } catch (error) {
    console.error(`[Email] Error crítico de envío SMTP a ${to}:`, error.message);
    throw error;
  }
};

module.exports = { sendMail };
