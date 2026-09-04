import express from 'express';
import { db } from '../database.js';
import { authenticateAdmin, logAdminAction } from '../middleware/auth.js';

const router = express.Router();

// GET /api/members (Public directory with search & filters)
router.get('/', (req, res) => {
  const { domain, status, search, year } = req.query;

  let members = db.all('members', m => {
    let match = true;

    if (domain && domain !== 'all') {
      match = match && m.domain && m.domain.toLowerCase().includes(domain.toLowerCase());
    }

    if (status && status !== 'all') {
      match = match && m.status === status;
    }

    if (year && year !== 'all') {
      match = match && m.year && m.year.toLowerCase().includes(year.toLowerCase());
    }

    if (search && search.trim()) {
      const s = search.trim().toLowerCase();
      const nameMatch = m.full_name && m.full_name.toLowerCase().includes(s);
      const rollMatch = m.roll_no && m.roll_no.toLowerCase().includes(s);
      const roleMatch = m.role && m.role.toLowerCase().includes(s);
      const domainMatch = m.domain && m.domain.toLowerCase().includes(s);
      match = match && (nameMatch || rollMatch || roleMatch || domainMatch);
    }

    return match;
  });

  // Sort: Core Team first, then Active, then Alumni
  members.sort((a, b) => {
    const statusOrder = { core_team: 1, active: 2, alumni: 3 };
    const orderA = statusOrder[a.status] || 4;
    const orderB = statusOrder[b.status] || 4;
    if (orderA !== orderB) return orderA - orderB;
    return (a.id || 0) - (b.id || 0);
  });

  return res.json({ members, count: members.length });
});

// GET /api/members/:id
router.get('/:id', (req, res) => {
  const member = db.get('members', m => m.id === parseInt(req.params.id, 10));
  if (!member) {
    return res.status(404).json({ error: 'Member not found.' });
  }
  return res.json({ member });
});

// POST /api/members (Admin add member)
router.post('/', authenticateAdmin, (req, res) => {
  const { full_name, roll_no, branch, year, domain, role, email, phone, bio, avatar_url, github_url, linkedin_url, portfolio_url, status } = req.body;

  if (!full_name || !roll_no || !email) {
    return res.status(400).json({ error: 'Full name, roll number, and email are required.' });
  }

  // Check roll_no uniqueness
  const existing = db.get('members', m => m.roll_no.toLowerCase() === roll_no.trim().toLowerCase() || m.email.toLowerCase() === email.trim().toLowerCase());
  if (existing) {
    return res.status(400).json({ error: 'A member with this roll number or email already exists.' });
  }

  const newMember = db.insert('members', {
    full_name: full_name.trim(),
    roll_no: roll_no.trim().toUpperCase(),
    branch: branch || 'Computer Science',
    year: year || '2nd Year',
    domain: domain || 'AR/VR & Spatial Computing',
    role: role || 'Member',
    email: email.trim().toLowerCase(),
    phone: phone || '',
    bio: bio || '',
    avatar_url: avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=400',
    github_url: github_url || '',
    linkedin_url: linkedin_url || '',
    portfolio_url: portfolio_url || '',
    status: status || 'active',
    joined_at: new Date().toISOString().split('T')[0]
  });

  logAdminAction(req.admin.username, 'ADD_MEMBER', { member_id: newMember.id, full_name, roll_no });

  return res.status(201).json({ message: 'Member created successfully', member: newMember });
});

// PUT /api/members/:id (Admin edit member)
router.put('/:id', authenticateAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = db.get('members', m => m.id === id);
  if (!existing) {
    return res.status(404).json({ error: 'Member not found.' });
  }

  const updated = db.update('members', m => m.id === id, req.body);
  logAdminAction(req.admin.username, 'EDIT_MEMBER', { member_id: id, full_name: updated.full_name });

  return res.json({ message: 'Member updated successfully', member: updated });
});

// DELETE /api/members/:id (Admin delete member)
router.delete('/:id', authenticateAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = db.get('members', m => m.id === id);
  if (!existing) {
    return res.status(404).json({ error: 'Member not found.' });
  }

  db.delete('members', m => m.id === id);
  logAdminAction(req.admin.username, 'DELETE_MEMBER', { member_id: id, full_name: existing.full_name });

  return res.json({ message: 'Member deleted successfully.' });
});

export default router;
