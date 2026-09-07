import jwt from 'jsonwebtoken';
import db from '../database.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'nextgen-arvr-portal-super-secret-key-2026';

export function authenticateAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Admin authentication token required.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: Token expired or invalid.' });
  }
}

export function logAdminAction(adminUsername, action, details) {
  try {
    db.insert('audit_logs', {
      admin_user: adminUsername || 'admin',
      action: action || 'UNKNOWN',
      details: typeof details === 'object' ? JSON.stringify(details) : String(details || '')
    });
  } catch (err) {
    console.error('Failed to log admin action:', err);
  }
}
