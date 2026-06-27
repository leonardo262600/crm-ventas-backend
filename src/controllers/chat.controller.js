const db = require('../config/db');

const getHistory = async (req, res) => {
  const { room = 'general', limit = 50 } = req.query;
  try {
    const [rows] = await db.query(
      `SELECT cm.*, u.name as user_name FROM chat_messages cm
       JOIN users u ON cm.user_id = u.id
       WHERE cm.tenant_id=? AND cm.room=?
       ORDER BY cm.created_at DESC LIMIT ?`,
      [req.user.tenant_id, room, Number(limit)]
    );
    res.json(rows.reverse());
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const getRooms = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT room, COUNT(*) as messages, MAX(created_at) as last_message
       FROM chat_messages WHERE tenant_id=?
       GROUP BY room ORDER BY last_message DESC`,
      [req.user.tenant_id]
    );
    const defaultRooms = ['general', 'ventas', 'soporte'];
    const existing = rows.map(r => r.room);
    defaultRooms.forEach(r => { if (!existing.includes(r)) rows.push({ room: r, messages: 0, last_message: null }); });
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

module.exports = { getHistory, getRooms };
