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

function resolveSchool(r) {
  if (r.school && r.school.trim()) return r.school.trim();
  const roll = (r.roll_no || r.register_no || '').toUpperCase();
  if (roll.includes('QUASAR')) return 'AU-QUASAR (Quantum Artificial Intelligence School for Advanced Research)';
  if (roll.includes('ASAC')) return 'Alliance School of Advanced Computing';
  if (roll.includes('ASAE')) return 'Alliance School of Applied Engineering';
  if (roll.includes('CED') || roll.includes('ACED')) return 'Alliance College of Engineering and Design';
  if (roll.includes('ASOB') || roll.includes('BBA') || roll.includes('MBA')) return 'Alliance School of Business';
  if (roll.includes('AAC') || roll.includes('ASCENT')) return 'Alliance Ascent College';
  if (roll.includes('AGBS')) return 'Alliance Global Business School';
  if (roll.includes('SOL') || roll.includes('LAW')) return 'Alliance School of Law';
  if (roll.includes('CEPP') || roll.includes('ESG')) return 'Centre of Excellence in Public Policy, Sustainability and ESG Research';
  if (roll.includes('SOD') || roll.includes('DES')) return 'Alliance School of Design (Alliance Global Design School)';
  if (roll.includes('SOE') || roll.includes('ECON')) return 'Alliance School of Economics';
  if (roll.includes('SOLA') || roll.includes('SLA')) return 'Alliance School of Liberal Arts';
  if (roll.includes('ASPA') || roll.includes('SOPA')) return 'Alliance School of Performing, Visual and Creative Arts';
  if (roll.includes('ASOS') || roll.includes('SOS')) return 'Alliance School of Sciences';
  if (roll.includes('FILM') || roll.includes('FMS') || roll.includes('MEDIA')) return 'Alliance School of Film and Media Studies';
  if (roll.includes('AVIA') || roll.includes('ASA')) return 'Alliance School of Aviation Studies';
  if (roll.includes('ASMT') || roll.includes('SMT')) return 'Alliance School of Management and Technology';
  return 'Alliance School of Advanced Computing';
}

function resolveSem(r) {
  if (r.semester && r.semester.trim()) return r.semester.trim();
  if (r.sem && r.sem.trim()) return r.sem.trim();
  const yr = (r.year || r.batch || '').toLowerCase();
  if (yr.includes('1st')) return '1st Sem';
  if (yr.includes('2nd')) return '3rd Sem';
  if (yr.includes('3rd')) return '5th Sem';
  if (yr.includes('4th')) return '7th Sem';
  return '1st Sem';
}

// 3. GET /api/admin/export/registrants.csv (All Registrants)
router.get('/registrants.csv', authenticateAdmin, (req, res) => {
  const registrants = db.all('event_registrations');
  const events = db.all('events');
  const eventMap = {};
  events.forEach(e => { 
    eventMap[e.id] = e.title;
    eventMap[String(e.id)] = e.title;
  });

  const headers = [
    { key: 'id', label: 'Registration ID' },
    { getter: r => eventMap[r.event_id] || eventMap[String(r.event_id)] || `Event #${r.event_id}`, label: 'Event Title' },
    { getter: r => r.full_name || r.name || '', label: 'Student Name' },
    { getter: r => r.roll_no || r.register_no || '', label: 'Register Number' },
    { getter: r => r.email || r.mail_id || '', label: 'Mail ID' },
    { getter: r => r.phone || r.contact_no || '', label: 'Contact Number' },
    { getter: r => resolveSchool(r), label: 'School' },
    { getter: r => r.department || r.branch || 'Information Technology', label: 'Department' },
    { getter: r => r.year || r.batch || '1st Year', label: 'Year' },
    { getter: r => resolveSem(r), label: 'Semester' },
    { getter: r => r.is_team ? 'Team' : 'Solo', label: 'Team / Solo' },
    { getter: r => r.team_name || '', label: 'Team Name' },
    { getter: r => r.team_members_info || '', label: 'Teammates' },
    { getter: r => r.ticket_id || `NG-EVT-${r.id}`, label: 'Ticket Pass ID' },
    { getter: r => r.registered_at || '', label: 'Registered Date' }
  ];

  const csv = generateCsv(headers, registrants);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="nextgen_all_registrations.csv"');
  return res.send(csv);
});

// 4. GET /api/admin/export/registrants/:eventId.csv
router.get('/registrants/:eventId.csv', authenticateAdmin, (req, res) => {
  const rawId = req.params.eventId;
  const event = db.get('events', e => String(e.id) === String(rawId));
  const registrants = db.all('event_registrations', r => String(r.event_id) === String(rawId));

  const headers = [
    { key: 'id', label: 'Registration ID' },
    { getter: r => r.full_name || r.name || '', label: 'Student Name' },
    { getter: r => r.roll_no || r.register_no || '', label: 'Register Number' },
    { getter: r => r.email || r.mail_id || '', label: 'Mail ID' },
    { getter: r => r.phone || r.contact_no || '', label: 'Contact Number' },
    { getter: r => resolveSchool(r), label: 'School' },
    { getter: r => r.department || r.branch || 'Information Technology', label: 'Department' },
    { getter: r => r.year || r.batch || '1st Year', label: 'Year' },
    { getter: r => resolveSem(r), label: 'Semester' },
    { getter: r => r.is_team ? 'Team' : 'Solo', label: 'Team / Solo' },
    { getter: r => r.team_name || '', label: 'Team Name' },
    { getter: r => r.team_members_info || '', label: 'Teammates' },
    { getter: r => r.ticket_id || `NG-EVT-${r.id}`, label: 'Ticket Pass ID' },
    { getter: r => r.registered_at || '', label: 'Registered Date' }
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
