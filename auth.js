import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../database.js';
import { JWT_SECRET, authenticateAdmin, logAdminAction } from '../middleware/auth.js';

const router = express.Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const admin = db.get('admins', a => (a.email && a.email.toLowerCase() === cleanEmail) || a.username === email.trim());

  if (!admin) {
    return res.status(401).json({ error: 'Invalid admin credentials.' });
  }

  const isMatch = bcrypt.compareSync(password, admin.password_hash);
  if (!isMatch) {
    return res.status(401).json({ error: 'Invalid admin credentials.' });
  }

  // Update last login
  db.update('admins', a => a.id === admin.id, { last_login: new Date().toISOString() });

  // Generate JWT token (expires in 24 hours)
  const token = jwt.sign(
    { id: admin.id, username: admin.username, email: admin.email, role: admin.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  logAdminAction(admin.username, 'ADMIN_LOGIN', `Admin logged in successfully.`);

  return res.json({
    message: 'Authentication successful',
    token,
    admin: {
      id: admin.id,
      username: admin.username,
      email: admin.email,
      role: admin.role
    }
  });
});

// GET /api/auth/verify (Verify current token)
router.get('/verify', authenticateAdmin, (req, res) => {
  const admin = db.get('admins', a => a.id === req.admin.id);
  if (!admin) {
    return res.status(404).json({ error: 'Admin account not found.' });
  }
  const { password_hash, ...safeAdmin } = admin;
  return res.json({ admin: safeAdmin });
});

// POST /api/auth/change-password
router.post('/change-password', authenticateAdmin, (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
  }

  const admin = db.get('admins', a => a.id === req.admin.id);
  const isMatch = bcrypt.compareSync(currentPassword, admin.password_hash);
  if (!isMatch) {
    return res.status(400).json({ error: 'Incorrect current password.' });
  }

  const salt = bcrypt.genSaltSync(10);
  const newHash = bcrypt.hashSync(newPassword, salt);

  db.update('admins', a => a.id === req.admin.id, { password_hash: newHash });
  logAdminAction(req.admin.username, 'PASSWORD_CHANGE', 'Admin updated password');

  return res.json({ message: 'Password updated successfully.' });
});

export default router;
