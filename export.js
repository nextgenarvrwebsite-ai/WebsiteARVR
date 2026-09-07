import express from 'express';
import { db } from '../database.js';
import { authenticateAdmin } from '../middleware/auth.js';

const router = express.Router();

function sanitizeCsvValue(val) {
  if (val === null || val === undefined) return '""';
  let str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

function generateCsv(headers, rows) {
  const headerLine = headers.map(h => sanitizeCsvValue(h.label)).join(',');
  const dataLines = rows.map(row => {
    return headers.map(h => sanitizeCsvValue(h.getter ? h.getter(row) : row[h.key])).join(',');
  });
  // Prepend UTF-8 Byte Order Mark (\uFEFF) so Excel immediately parses UTF-8 correctly
  return '\uFEFF' + [headerLine, ...dataLines].join('\r\n');
}

// 1. GET /api/admin/export/members.csv
router.get('/members.csv', authenticateAdmin, (req, res) => {
  const members = db.all('members');

  const headers = [
    { key: 'id', label: 'Member ID' },
    { key: 'full_name', label: 'Full Name' },
    { key: 'roll_no', label: 'Roll Number' },
    { key: 'branch', label: 'Branch' },
    { key: 'year', label: 'Year' },
    { key: 'domain', label: 'Domain' },
    { key: 'role', label: 'Role' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'status', label: 'Status' },
    { key: 'joined_at', label: 'Joined Date' }
  ];

  const csv = generateCsv(headers, members);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="nextgen_members.csv"');
  return res.send(csv);
});

// 2. GET /api/admin/export/applications.csv
router.get('/applications.csv', authenticateAdmin, (req, res) => {
  const apps = db.all('applications');

  const headers = [
    { key: 'id', label: 'Application ID' },
    { key: 'full_name', label: 'Full Name' },
    { key: 'roll_no', label: 'Roll Number' },
    { key: 'branch', label: 'Branch' },
    { key: 'year', label: 'Year' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { getter: a => Array.isArray(a.domains) ? a.domains.join(', ') : a.domains, label: 'Interested Domains' },
    { key: 'why_join', label: 'Motivation' },
    { key: 'experience', label: 'Prior Experience' },
    { key: 'portfolio_url', label: 'Portfolio URL' },
    { key: 'status', label: 'Review Status' },
    { key: 'submitted_at', label: 'Submitted At' }
  ];

  const csv = generateCsv(headers, apps);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="nextgen_applications.csv"');
  return res.send(csv);
});

// 3. GET /api/admin/export/registrants.csv (All Registrants)
router.get('/registrants.csv', authenticateAdmin, (req, res) => {
  const registrants = db.all('event_registrations');
  const events = db.all('events');
  const eventMap = {};
  events.forEach(e => { eventMap[e.id] = e.title; });

  const headers = [
    { key: 'id', label: 'Registration ID' },
    { getter: r => eventMap[r.event_id] || `Event #${r.event_id}`, label: 'Event Title' },
    { key: 'full_name', label: 'Attendee Name' },
    { key: 'roll_no', label: 'Roll Number' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'branch', label: 'Branch' },
    { key: 'year', label: 'Year' },
    { getter: r => r.is_team ? 'Team' : 'Solo', label: 'Mode' },
    { key: 'team_name', label: 'Team Name' },
    { key: 'team_members_info', label: 'Team Members' },
    { key: 'registered_at', label: 'Registered At' }
  ];

  const csv = generateCsv(headers, registrants);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="nextgen_all_registrations.csv"');
  return res.send(csv);
});

// 4. GET /api/admin/export/registrants/:eventId.csv
router.get('/registrants/:eventId.csv', authenticateAdmin, (req, res) => {
  const eventId = parseInt(req.params.eventId, 10);
  const event = db.get('events', e => e.id === eventId);
  const registrants = db.all('event_registrations', r => r.event_id === eventId);

  const headers = [
    { key: 'id', label: 'Registration ID' },
    { key: 'full_name', label: 'Attendee Name' },
    { key: 'roll_no', label: 'Roll Number' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'branch', label: 'Branch' },
    { key: 'year', label: 'Year' },
    { getter: r => r.is_team ? 'Team' : 'Solo', label: 'Type' },
    { key: 'team_name', label: 'Team Name' },
    { key: 'team_members_info', label: 'Team Members' },
    { key: 'registered_at', label: 'Registration Date' }
  ];

  const csv = generateCsv(headers, registrants);
  const safeTitle = event ? event.title.replace(/[^a-zA-Z0-9]/g, '_') : 'event';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="registrants_${safeTitle}.csv"`);
  return res.send(csv);
});

// 5. GET /api/admin/export/feedback.csv
router.get('/feedback.csv', authenticateAdmin, (req, res) => {
  const feedbackList = db.all('feedback');

  const headers = [
    { key: 'id', label: 'Feedback ID' },
    { key: 'event_title', label: 'Event / Session' },
    { key: 'rating_content', label: 'Content Rating (1-5)' },
    { key: 'rating_organization', label: 'Organization Rating (1-5)' },
    { key: 'rating_speaker', label: 'Speaker Rating (1-5)' },
    { getter: f => (( (f.rating_content||5) + (f.rating_organization||5) + (f.rating_speaker||5) ) / 3).toFixed(1), label: 'Average Score' },
    { key: 'what_liked', label: 'What Worked Well' },
    { key: 'what_improve', label: 'Suggested Improvements' },
    { key: 'comments', label: 'Open Comments' },
    { key: 'author_name', label: 'Submitted By' },
    { key: 'author_email', label: 'Email' },
    { key: 'submitted_at', label: 'Timestamp' }
  ];

  const csv = generateCsv(headers, feedbackList);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="nextgen_feedback.csv"');
  return res.send(csv);
});

// 6. GET /api/admin/export/backup.json
router.get('/backup.json', authenticateAdmin, (req, res) => {
  const backup = {
    export_timestamp: new Date().toISOString(),
    applications: db.all('applications'),
    members: db.all('members'),
    events: db.all('events'),
    registrations: db.all('event_registrations'),
    feedback: db.all('feedback')
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="nextgen_backup_${new Date().toISOString().slice(0, 10)}.json"`);
  return res.send(JSON.stringify(backup, null, 2));
});

export default router;
