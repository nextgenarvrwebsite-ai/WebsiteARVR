import express from 'express';
import { db } from '../database.js';
import { authenticateAdmin, logAdminAction } from '../middleware/auth.js';

const router = express.Router();

// POST /api/applications (Public application submission)
router.post('/', (req, res) => {
  const { full_name, roll_no, branch, year, email, phone, domains, why_join, experience, portfolio_url } = req.body;

  // Validation
  if (!full_name || !roll_no || !email || !phone || !branch || !year || !why_join) {
    return res.status(400).json({ error: 'Please fill in all required application fields.' });
  }

  // Check recruitment status
  const recruitmentStatus = db.getSetting('recruitment_status', { is_open: true });
  if (recruitmentStatus && recruitmentStatus.is_open === false) {
    return res.status(400).json({ error: 'Recruitment is currently closed. Stay tuned for upcoming cycles!' });
  }

  // Check if applicant already applied in current cycle
  const existing = db.get('applications', a =>
    (a.roll_no.toLowerCase() === roll_no.trim().toLowerCase() || a.email.toLowerCase() === email.trim().toLowerCase()) &&
    a.status === 'pending'
  );

  if (existing) {
    return res.status(400).json({ error: 'You have already submitted an active application under review.' });
  }

  const newApp = db.insert('applications', {
    full_name: full_name.trim(),
    roll_no: roll_no.trim().toUpperCase(),
    branch: branch.trim(),
    year: year.trim(),
    email: email.trim().toLowerCase(),
    phone: phone.trim(),
    domains: Array.isArray(domains) ? domains : [domains || 'AR/VR & Spatial Computing'],
    why_join: why_join.trim(),
    experience: experience ? experience.trim() : '',
    portfolio_url: portfolio_url ? portfolio_url.trim() : '',
    status: 'pending',
    review_notes: '',
    submitted_at: new Date().toISOString()
  });

  return res.status(201).json({
    message: 'Application submitted successfully! Our core team will review your application soon.',
    application_id: newApp.id,
    tracking_code: `NEXTGEN-APP-${String(newApp.id).padStart(4, '0')}`
  });
});

// GET /api/applications (Admin view all applications)
router.get('/', authenticateAdmin, (req, res) => {
  const { status, search, domain } = req.query;

  let apps = db.all('applications', a => {
    let match = true;

    if (status && status !== 'all') {
      match = match && a.status === status;
    }

    if (domain && domain !== 'all') {
      match = match && Array.isArray(a.domains) && a.domains.some(d => d.toLowerCase().includes(domain.toLowerCase()));
    }

    if (search && search.trim()) {
      const s = search.trim().toLowerCase();
      match = match && (
        (a.full_name && a.full_name.toLowerCase().includes(s)) ||
        (a.roll_no && a.roll_no.toLowerCase().includes(s)) ||
        (a.email && a.email.toLowerCase().includes(s)) ||
        (a.branch && a.branch.toLowerCase().includes(s))
      );
    }

    return match;
  });

  // Sort: newest first
  apps.sort((a, b) => new Date(b.submitted_at || b.created_at) - new Date(a.submitted_at || a.created_at));

  return res.json({ applications: apps, count: apps.length });
});

// PUT /api/applications/:id/review (Admin approve/reject)
router.put('/:id/review', authenticateAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { status, review_notes, assigned_domain, assigned_role } = req.body;

  if (!status || !['approved', 'rejected', 'pending'].includes(status)) {
    return res.status(400).json({ error: 'Status must be approved, rejected, or pending.' });
  }

  const app = db.get('applications', a => a.id === id);
  if (!app) {
    return res.status(404).json({ error: 'Application not found.' });
  }

  const updatedApp = db.update('applications', a => a.id === id, {
    status,
    review_notes: review_notes || app.review_notes || '',
    reviewed_at: new Date().toISOString(),
    reviewed_by: req.admin.username
  });

  let createdMember = null;

  // If approved, automatically add applicant as active member in Members directory
  if (status === 'approved') {
    const existingMember = db.get('members', m => m.roll_no.toLowerCase() === app.roll_no.toLowerCase() || m.email.toLowerCase() === app.email.toLowerCase());

    if (!existingMember) {
      const primaryDomain = assigned_domain || (Array.isArray(app.domains) && app.domains[0]) || 'AR/VR & Spatial Computing';
      createdMember = db.insert('members', {
        full_name: app.full_name,
        roll_no: app.roll_no,
        branch: app.branch,
        year: app.year,
        domain: primaryDomain,
        role: assigned_role || 'Member',
        email: app.email,
        phone: app.phone,
        bio: app.why_join ? app.why_join.slice(0, 180) + '...' : 'NextGen AR/VR club member',
        avatar_url: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(app.full_name)}`,
        github_url: '',
        linkedin_url: '',
        portfolio_url: app.portfolio_url || '',
        status: 'active',
        joined_at: new Date().toISOString().split('T')[0]
      });
    }
  }

  logAdminAction(req.admin.username, `APPLICATION_${status.toUpperCase()}`, {
    application_id: id,
    applicant_name: app.full_name,
    roll_no: app.roll_no,
    member_created: !!createdMember
  });

  return res.json({
    message: `Application has been marked as ${status}.`,
    application: updatedApp,
    createdMember
  });
});

export default router;
