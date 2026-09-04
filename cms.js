import express from 'express';
import { db } from '../database.js';
import { authenticateAdmin, logAdminAction } from '../middleware/auth.js';

const router = express.Router();

// GET /api/cms/settings (Public site settings)
router.get('/settings', (req, res) => {
  const recruitment = db.getSetting('recruitment_status', { is_open: true, batch_name: 'Fall 2026 Cohort' });
  const banner = db.getSetting('announcement_banner', { active: true, title: 'Welcome to NextGen AR/VR' });
  const stats = db.getSetting('club_stats', { members_count: '250+', projects_count: '24+' });
  const contact = db.getSetting('contact_info', {});

  return res.json({
    recruitment_status: recruitment,
    announcement_banner: banner,
    club_stats: stats,
    contact_info: contact
  });
});

// PUT /api/cms/settings (Admin update site settings)
router.put('/settings', authenticateAdmin, (req, res) => {
  const { key, value } = req.body;

  if (!key || value === undefined) {
    return res.status(400).json({ error: 'Settings key and value are required.' });
  }

  db.setSetting(key, value);
  logAdminAction(req.admin.username, 'UPDATE_SITE_SETTING', { key, value });

  return res.json({ message: `Setting "${key}" updated successfully.`, key, value });
});

// GET /api/cms/stats (Admin dashboard overview metrics)
router.get('/dashboard-stats', authenticateAdmin, (req, res) => {
  const totalMembers = db.count('members');
  const activeMembers = db.count('members', m => m.status === 'active' || m.status === 'core_team');
  const pendingApplications = db.count('applications', a => a.status === 'pending');
  const today = new Date().toISOString().split('T')[0];
  const upcomingEvents = db.count('events', e => e.event_date >= today);
  const totalRegistrations = db.count('event_registrations');
  const totalFeedback = db.count('feedback');
  const activeTournaments = db.count('esports_tournaments', t => t.status === 'live');

  // Compute average feedback score
  const feedbackList = db.all('feedback');
  let avgFeedback = 0;
  if (feedbackList.length > 0) {
    const sum = feedbackList.reduce((acc, f) => acc + ((f.rating_content + f.rating_organization + f.rating_speaker) / 3), 0);
    avgFeedback = Number((sum / feedbackList.length).toFixed(1));
  }

  // Recent applications
  const recentApps = db.all('applications')
    .sort((a, b) => new Date(b.submitted_at || b.created_at) - new Date(a.submitted_at || a.created_at))
    .slice(0, 5);

  // Recent feedback
  const recentFeedback = db.all('feedback')
    .sort((a, b) => new Date(b.submitted_at || b.created_at) - new Date(a.submitted_at || a.created_at))
    .slice(0, 5);

  // Recent audit logs
  const auditLogs = db.all('audit_logs')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 10);

  return res.json({
    metrics: {
      totalMembers,
      activeMembers,
      pendingApplications,
      upcomingEvents,
      totalRegistrations,
      totalFeedback,
      avgFeedback,
      activeTournaments
    },
    recentApps,
    recentFeedback,
    auditLogs
  });
});

// GET /api/cms/audit-logs (Admin view audit log trail)
router.get('/audit-logs', authenticateAdmin, (req, res) => {
  const logs = db.all('audit_logs')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return res.json({ logs });
});

export default router;
