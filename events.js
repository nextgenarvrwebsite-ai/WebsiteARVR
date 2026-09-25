import express from 'express';
import { db } from '../database.js';
import { authenticateAdmin, logAdminAction } from '../middleware/auth.js';

const router = express.Router();

// Helper to calculate spots remaining and registration counts
function enrichEvent(event) {
  const registrations = db.all('event_registrations', r => r.event_id === event.id);
  const totalRegistrants = registrations.length;
  const spotsRemaining = Math.max(0, (event.max_seats || 100) - totalRegistrants);
  return {
    ...event,
    total_registrants: totalRegistrants,
    spots_remaining: spotsRemaining,
    is_full: spotsRemaining === 0
  };
}

// GET /api/events (Public list with filters)
router.get('/', (req, res) => {
  const { category, type, search } = req.query;
  const today = new Date().toISOString().split('T')[0];

  let events = db.all('events', e => {
    let match = true;

    if (category && category !== 'all') {
      match = match && e.category && e.category.toLowerCase() === category.toLowerCase();
    }

    if (type === 'upcoming') {
      match = match && e.event_date >= today;
    } else if (type === 'past') {
      match = match && e.event_date < today;
    }

    if (search && search.trim()) {
      const s = search.trim().toLowerCase();
      match = match && (
        (e.title && e.title.toLowerCase().includes(s)) ||
        (e.description && e.description.toLowerCase().includes(s)) ||
        (e.venue && e.venue.toLowerCase().includes(s))
      );
    }

    return match;
  });

  // Enrich with live seat counts
  const enriched = events.map(enrichEvent);

  // Sort: upcoming events sorted by date ASC (closest first), past events DESC
  if (type === 'past') {
    enriched.sort((a, b) => new Date(b.event_date) - new Date(a.event_date));
  } else {
    enriched.sort((a, b) => new Date(a.event_date) - new Date(b.event_date));
  }

  return res.json({ events: enriched, count: enriched.length });
});

// GET /api/events/:id (Public details)
router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const event = db.get('events', e => e.id === id || e.slug === req.params.id);
  if (!event) {
    return res.status(404).json({ error: 'Event not found.' });
  }

  const enriched = enrichEvent(event);
  return res.json({ event: enriched });
});

// POST /api/events/:id/register (Public registration)
router.post('/:id/register', (req, res) => {
  const rawId = req.params.id;
  const event = db.get('events', e => String(e.id) === String(rawId));

  if (!event) {
    return res.status(404).json({ error: 'Event not found.' });
  }

  if (event.is_registration_open === 0 || event.is_registration_open === false) {
    return res.status(400).json({ error: 'Registration for this event is currently closed.' });
  }

  const {
    full_name,
    name,
    roll_no,
    register_no,
    email,
    mail_id,
    phone,
    contact_no,
    school,
    branch,
    department,
    year,
    semester,
    sem,
    is_team,
    team_name,
    team_members_info
  } = req.body;

  const resolvedName = (full_name || name || '').trim();
  const resolvedRoll = (roll_no || register_no || '').trim().toUpperCase();
  const resolvedEmail = (email || mail_id || '').trim().toLowerCase();
  const resolvedPhone = (phone || contact_no || '').trim();
  const resolvedSchool = (school || '').trim();
  const resolvedDept = (department || branch || 'Information Technology').trim();
  const resolvedYear = (year || '1st Year').trim();
  const resolvedSem = (semester || sem || '').trim();

  if (!resolvedName || !resolvedRoll || !resolvedEmail || !resolvedPhone) {
    return res.status(400).json({ error: 'Please provide full name, roll number, email, and phone.' });
  }

  if (is_team && (!team_name || !team_name.trim())) {
    return res.status(400).json({ error: 'Team name is required for team registrations.' });
  }

  // Determine fallback school & semester if missing
  let finalSchool = resolvedSchool;
  if (!finalSchool) {
    if (resolvedRoll.includes('QUASAR')) finalSchool = 'AU-QUASAR (Quantum Artificial Intelligence School for Advanced Research)';
    else if (resolvedRoll.includes('ASAC')) finalSchool = 'Alliance School of Advanced Computing';
    else if (resolvedRoll.includes('ASAE')) finalSchool = 'Alliance School of Applied Engineering';
    else if (resolvedRoll.includes('CED') || resolvedRoll.includes('ACED')) finalSchool = 'Alliance College of Engineering and Design';
    else if (resolvedRoll.includes('ASOB') || resolvedRoll.includes('BBA') || resolvedRoll.includes('MBA')) finalSchool = 'Alliance School of Business';
    else if (resolvedRoll.includes('AAC') || resolvedRoll.includes('ASCENT')) finalSchool = 'Alliance Ascent College';
    else if (resolvedRoll.includes('AGBS')) finalSchool = 'Alliance Global Business School';
    else if (resolvedRoll.includes('SOL') || resolvedRoll.includes('LAW')) finalSchool = 'Alliance School of Law';
    else if (resolvedRoll.includes('CEPP') || resolvedRoll.includes('ESG')) finalSchool = 'Centre of Excellence in Public Policy, Sustainability and ESG Research';
    else if (resolvedRoll.includes('SOD') || resolvedRoll.includes('DES')) finalSchool = 'Alliance School of Design (Alliance Global Design School)';
    else if (resolvedRoll.includes('SOE') || resolvedRoll.includes('ECON')) finalSchool = 'Alliance School of Economics';
    else if (resolvedRoll.includes('SOLA') || resolvedRoll.includes('SLA')) finalSchool = 'Alliance School of Liberal Arts';
    else if (resolvedRoll.includes('ASPA') || resolvedRoll.includes('SOPA')) finalSchool = 'Alliance School of Performing, Visual and Creative Arts';
    else if (resolvedRoll.includes('ASOS') || resolvedRoll.includes('SOS')) finalSchool = 'Alliance School of Sciences';
    else if (resolvedRoll.includes('FILM') || resolvedRoll.includes('FMS') || resolvedRoll.includes('MEDIA')) finalSchool = 'Alliance School of Film and Media Studies';
    else if (resolvedRoll.includes('AVIA') || resolvedRoll.includes('ASA')) finalSchool = 'Alliance School of Aviation Studies';
    else if (resolvedRoll.includes('ASMT') || resolvedRoll.includes('SMT')) finalSchool = 'Alliance School of Management and Technology';
    else finalSchool = 'Alliance School of Advanced Computing';
  }

  let finalSem = resolvedSem;
  if (!finalSem) {
    if (resolvedYear.includes('1st')) finalSem = '1st Sem';
    else if (resolvedYear.includes('2nd')) finalSem = '3rd Sem';
    else if (resolvedYear.includes('3rd')) finalSem = '5th Sem';
    else if (resolvedYear.includes('4th')) finalSem = '7th Sem';
    else finalSem = '1st Sem';
  }

  // Check existing registration: If student submits again, update their details so their latest school & sem are saved!
  const existing = db.get('event_registrations', r =>
    String(r.event_id) === String(rawId) &&
    (String(r.roll_no || '').toLowerCase() === resolvedRoll.toLowerCase() || String(r.email || '').toLowerCase() === resolvedEmail.toLowerCase())
  );

  if (existing) {
    db.update('event_registrations', r => r.id === existing.id, {
      full_name: resolvedName,
      phone: resolvedPhone,
      school: finalSchool,
      branch: resolvedDept,
      department: resolvedDept,
      year: resolvedYear,
      semester: finalSem,
      is_team: is_team ? 1 : 0,
      team_name: team_name ? team_name.trim() : '',
      team_members_info: team_members_info ? team_members_info.trim() : '',
      status: 'confirmed',
      updated_at: new Date().toISOString()
    });

    return res.status(200).json({
      message: 'Event registration confirmed & updated with latest school/semester details!',
      registration_id: existing.id,
      ticket_id: existing.ticket_id || `NG-${(event.category || 'EVT').slice(0, 3).toUpperCase()}-${String(existing.id).padStart(4, '0')}`,
      updated: true
    });
  }

  // Check seat capacity
  const currentCount = db.count('event_registrations', r => String(r.event_id) === String(rawId));
  if (currentCount >= (event.max_seats || 100)) {
    return res.status(400).json({ error: 'Event has reached maximum capacity.' });
  }

  const registration = db.insert('event_registrations', {
    event_id: event.id,
    full_name: resolvedName,
    roll_no: resolvedRoll,
    email: resolvedEmail,
    phone: resolvedPhone,
    school: finalSchool,
    branch: resolvedDept,
    department: resolvedDept,
    year: resolvedYear,
    semester: finalSem,
    is_team: is_team ? 1 : 0,
    team_name: team_name ? team_name.trim() : '',
    team_members_info: team_members_info ? team_members_info.trim() : '',
    status: 'confirmed',
    registered_at: new Date().toISOString()
  });

  return res.status(201).json({
    message: 'Event registration confirmed! See you at the event.',
    registration_id: registration.id,
    ticket_id: `NG-${(event.category || 'EVT').slice(0, 3).toUpperCase()}-${String(registration.id).padStart(4, '0')}`
  });
});

// Batch sync events endpoint (from Admin portal or cloud sync)
function handleBatchSync(req, res) {
  const eventsList = Array.isArray(req.body) ? req.body : (req.body && req.body.events);
  if (!Array.isArray(eventsList)) {
    return res.status(400).json({ error: 'Expected an array of events.' });
  }

  const legacyTitles = [
    'meta spatial hackathon 2026',
    'unreal engine 5.5 masterclass: nanite & lumen',
    'cyberclash: collegiate valorant championship',
    'hands-on webxr & three.js bootcamp',
    'hands-on spatial xr & webxr masterclass 2026'
  ];

  const currentEvents = db.all('events');
  const mergedMap = new Map();

  // 1. Existing events in database
  currentEvents.forEach(e => {
    if (!e || !e.id) return;
    const t = (e.title || '').trim().toLowerCase();
    if (legacyTitles.includes(t) || t.includes('hands-on spatial xr') || t.includes('spatial xr & webxr')) return;
    mergedMap.set(String(e.id), e);
  });

  // 2. Merge incoming events
  eventsList.forEach((e, idx) => {
    if (!e || !e.title) return;
    const t = (e.title || '').trim().toLowerCase();
    if (legacyTitles.includes(t) || t.includes('hands-on spatial xr') || t.includes('spatial xr & webxr')) return;

    const id = e.id ? String(e.id) : String(Date.now() + idx);
    const existing = mergedMap.get(id);

    const clean = {
      ...(existing || {}),
      ...e,
      id: parseInt(id, 10) || id,
      title: (e.title || '').trim(),
      slug: e.slug || (e.title || 'event').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      category: e.category || existing?.category || 'Workshop',
      event_date: e.event_date || existing?.event_date || new Date().toISOString().split('T')[0],
      event_time: e.event_time || existing?.event_time || '02:00 PM - 05:00 PM',
      venue: (e.venue || existing?.venue || 'Room 402, Spatial VR Lab').trim(),
      description: (e.description || existing?.description || '').trim(),
      poster_url: e.poster_url || existing?.poster_url || 'https://images.unsplash.com/photo-1592478411213-6153e4ebc07d?auto=format&fit=crop&q=80&w=800',
      is_registration_open: e.is_registration_open !== undefined ? (e.is_registration_open ? 1 : 0) : (existing?.is_registration_open ?? 1),
      max_seats: parseInt(e.max_seats, 10) || existing?.max_seats || 100,
      is_team_event: e.is_team_event ? 1 : (existing?.is_team_event ? 1 : 0),
      max_team_size: parseInt(e.max_team_size, 10) || existing?.max_team_size || 4,
      tags: Array.isArray(e.tags) ? e.tags : (e.tags ? String(e.tags).split(',').map(s => s.trim()) : (existing?.tags || ['AR/VR', 'NextGen'])),
      feedbackQuestions: Array.isArray(e.feedbackQuestions) ? e.feedbackQuestions : (existing?.feedbackQuestions || []),
      created_at: e.created_at || existing?.created_at || new Date().toISOString()
    };

    mergedMap.set(id, clean);
  });

  const finalEvents = Array.from(mergedMap.values());
  db.setAll('events', finalEvents);
  return res.json({ success: true, count: finalEvents.length, events: finalEvents.map(enrichEvent) });
}

router.post('/sync', handleBatchSync);
router.post('/batch', handleBatchSync);

// POST /api/events (Admin create event OR batch sync)
router.post('/', (req, res, next) => {
  // If request contains an array of events, handle batch sync
  if (Array.isArray(req.body) || (req.body && Array.isArray(req.body.events))) {
    return handleBatchSync(req, res);
  }
  // Otherwise require admin authentication for single event creation
  return authenticateAdmin(req, res, () => {
    const { title, category, event_date, event_time, venue, description, poster_url, is_registration_open, max_seats, is_team_event, max_team_size, tags, feedbackQuestions } = req.body;

    if (!title || !event_date || !venue || !description) {
      return res.status(400).json({ error: 'Title, date, venue, and description are required.' });
    }

    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString().slice(-4);

    const newEvent = db.insert('events', {
      title: title.trim(),
      slug,
      category: category || 'Workshop',
      event_date,
      event_time: event_time || '02:00 PM - 05:00 PM',
      venue: venue.trim(),
      description: description.trim(),
      poster_url: poster_url || 'https://images.unsplash.com/photo-1592478411213-6153e4ebc07d?auto=format&fit=crop&q=80&w=800',
      is_registration_open: is_registration_open !== undefined ? (is_registration_open ? 1 : 0) : 1,
      max_seats: parseInt(max_seats, 10) || 100,
      is_team_event: is_team_event ? 1 : 0,
      max_team_size: parseInt(max_team_size, 10) || 4,
      tags: Array.isArray(tags) ? tags : (tags ? String(tags).split(',').map(t => t.trim()) : ['AR/VR', 'NextGen']),
      feedbackQuestions: Array.isArray(feedbackQuestions) ? feedbackQuestions : [],
      created_at: new Date().toISOString()
    });

    logAdminAction(req.admin.username, 'CREATE_EVENT', { event_id: newEvent.id, title });

    return res.status(201).json({ message: 'Event created successfully', event: newEvent });
  });
});

// PUT /api/events/:id (Admin edit event)
router.put('/:id', authenticateAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = db.get('events', e => e.id === id);

  if (!existing) {
    return res.status(404).json({ error: 'Event not found.' });
  }

  const updatePayload = { ...req.body };
  if (updatePayload.is_registration_open !== undefined) {
    updatePayload.is_registration_open = updatePayload.is_registration_open ? 1 : 0;
  }
  if (updatePayload.max_seats !== undefined) {
    updatePayload.max_seats = parseInt(updatePayload.max_seats, 10);
  }
  if (updatePayload.tags && typeof updatePayload.tags === 'string') {
    updatePayload.tags = updatePayload.tags.split(',').map(t => t.trim());
  }

  const updated = db.update('events', e => e.id === id, updatePayload);
  logAdminAction(req.admin.username, 'EDIT_EVENT', { event_id: id, title: updated.title });

  return res.json({ message: 'Event updated successfully', event: updated });
});

// DELETE /api/events/:id (Admin delete event)
router.delete('/:id', authenticateAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = db.get('events', e => e.id === id);

  if (!existing) {
    return res.status(404).json({ error: 'Event not found.' });
  }

  db.delete('events', e => e.id === id);
  db.delete('event_registrations', r => r.event_id === id);

  logAdminAction(req.admin.username, 'DELETE_EVENT', { event_id: id, title: existing.title });

  return res.json({ message: 'Event deleted successfully.' });
});

function resolveSchool(r) {
  if (r.school && r.school.trim()) return r.school.trim();
  const roll = (r.roll_no || r.register_no || '').toUpperCase();
  if (roll.includes('QUASAR')) return 'AU-QUASAR';
  if (roll.includes('ASAC')) return 'Alliance School of Advanced Computing';
  if (roll.includes('ASAE') || roll.includes('CED')) return 'Alliance School of Applied Engineering';
  if (roll.includes('ASOB') || roll.includes('BBA') || roll.includes('MBA')) return 'Alliance School of Business';
  if (roll.includes('SOL') || roll.includes('LAW')) return 'Alliance School of Law';
  if (roll.includes('SOD') || roll.includes('DES')) return 'Alliance School of Design';
  if (roll.includes('SOE') || roll.includes('ECON')) return 'Alliance School of Economics';
  if (roll.includes('SOLA') || roll.includes('SLA')) return 'Alliance School of Liberal Arts';
  if (roll.includes('ASPA') || roll.includes('SOPA')) return 'Alliance School of Performing Arts';
  if (roll.includes('ASOS') || roll.includes('SOS')) return 'Alliance School of Sciences';
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

// GET /api/events/registrations/all (Universal sync for all registrations)
router.get('/registrations/all', (req, res) => {
  const registrants = db.all('event_registrations').map(r => ({
    ...r,
    school: resolveSchool(r),
    semester: resolveSem(r)
  }));
  return res.json({ registrants, count: registrants.length });
});

// GET /api/events/:id/registrants (Admin view registrants)
router.get('/:id/registrants', (req, res) => {
  const rawId = req.params.id;
  const event = db.get('events', e => String(e.id) === String(rawId));

  const registrants = db.all('event_registrations', r => String(r.event_id) === String(rawId)).map(r => ({
    ...r,
    school: resolveSchool(r),
    semester: resolveSem(r)
  }));
  return res.json({ event: event || { id: rawId, title: 'Event' }, registrants, count: registrants.length });
});

export default router;

