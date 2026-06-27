const webpush = require('web-push');
const db = require('../config/db');

// Configuración de las llaves (deben estar idealmente en .env)
const publicVapidKey = process.env.VAPID_PUBLIC_KEY || 'BGZdqac2qhkNacgilEQHQWmLjX6DF7J4iPjqHCgv39Oa5UwrvP3oVBD267G4JHdG59dOWD9SvYJfWbgd9yBW6Fk';
const privateVapidKey = process.env.VAPID_PRIVATE_KEY || 'Sglg-lx3R5ooOX3cDl_ioeksJUmWzWViQxL4o32K9FY';

webpush.setVapidDetails('mailto:soporte@crmventas.com', publicVapidKey, privateVapidKey);

const subscribe = async (req, res) => {
  const subscription = req.body;
  const { endpoint, keys } = subscription;

  try {
    // Evitar duplicados
    const [existing] = await db.query('SELECT id FROM push_subscriptions WHERE endpoint = ? AND user_id = ?', [endpoint, req.user.id]);
    
    if (!existing.length) {
      await db.query(
        'INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)',
        [req.user.id, endpoint, keys.p256dh, keys.auth]
      );
    }
    
    res.status(201).json({ message: 'Suscrito con éxito' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const sendTestNotification = async (req, res) => {
  try {
    const [subs] = await db.query('SELECT * FROM push_subscriptions WHERE user_id = ?', [req.user.id]);
    
    if (!subs.length) {
      return res.status(404).json({ message: 'No hay suscripciones activas para este usuario' });
    }

    const payload = JSON.stringify({
      title: 'Notificación de Prueba',
      body: '¡Excelente! Las notificaciones Push de CRM Ventas están funcionando correctamente en tu equipo.',
      icon: '/vite.svg'
    });

    for (const sub of subs) {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth }
      };

      try {
        await webpush.sendNotification(pushSubscription, payload);
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          // Suscripción inválida/caducada, eliminar
          await db.query('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]);
        }
      }
    }
    
    res.json({ message: 'Notificación enviada' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Función auxiliar para usar internamente en otros controladores (ej. cuando se gana una op, se asigna tarea)
const sendPushToUser = async (userId, title, body) => {
  try {
    const [subs] = await db.query('SELECT * FROM push_subscriptions WHERE user_id = ?', [userId]);
    const payload = JSON.stringify({ title, body, icon: '/vite.svg' });

    for (const sub of subs) {
      const pushSubscription = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };
      try {
        await webpush.sendNotification(pushSubscription, payload);
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await db.query('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]);
        }
      }
    }
  } catch (err) {
    console.error('[WebPush] Error enviando a usuario', userId, err.message);
  }
};

module.exports = { subscribe, sendTestNotification, sendPushToUser };
