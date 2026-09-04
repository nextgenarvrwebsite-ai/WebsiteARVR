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
  const id = parseInt(req.params.id, 10);
  const event = db.get('events', e => e.id === id);

  if (!event) {
    return res.status(404).json({ error: 'Event not found.' });
  }

  if (event.is_registration_open === 0 || event.is_registration_open === false) {
    return res.status(400).json({ error: 'Registration for this event is currently closed.' });
  }

  const { full_name, roll_no, email, phone, branch, year, is_team, team_name, team_members_info } = req.body;

  if (!full_name || !roll_no || !email || !phone) {
    return res.status(400).json({ error: 'Please provide full name, roll number, email, and phone.' });
  }

  if (is_team && (!team_name || !team_name.trim())) {
    return res.status(400).json({ error: 'Team name is required for team registrations.' });
  }

  // Check existing registration
  const existing = db.get('event_registrations', r =>
    r.event_id === id &&
    (r.roll_no.toLowerCase() === roll_no.trim().toLowerCase() || r.email.toLowerCase() === email.trim().toLowerCase())
  );

  if (existing) {
    return res.status(400).json({ error: 'You have already registered for this event.' });
  }

  // Check seat capacity
  const currentCount = db.count('event_registrations', r => r.event_id === id);
  if (currentCount >= (event.max_seats || 100)) {
    return res.status(400).json({ error: 'Event has reached maximum capacity.' });
  }

  const registration = db.insert('event_registrations', {
    event_id: id,
    full_name: full_name.trim(),
    roll_no: roll_no.trim().toUpperCase(),
    email: email.trim().toLowerCase(),
    phone: phone.trim(),
    branch: branch || 'Engineering',
    year: year || '2nd Year',
    is_team: is_team ? 1 : 0,
    team_name: team_name ? team_name.trim() : '',
    team_members_info: team_members_info ? team_members_info.trim() : '',
    status: 'confirmed',
    registered_at: new Date().toISOString()
  });

  return res.status(201).json({
    message: 'Event registration confirmed! See you at the event.',
    registration_id: registration.id,
    ticket_id: `NG-${event.category.slice(0, 3).toUpperCase()}-${String(registration.id).padStart(4, '0')}`
  });
});

// POST /api/events (Admin create event)
router.post('/', authenticateAdmin, (req, res) => {
  const { title, category, event_date, event_time, venue, description, poster_url, is_registration_open, max_seats, is_team_event, max_team_size, tags } = req.body;

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
    created_at: new Date().toISOString()
  });

  logAdminAction(req.admin.username, 'CREATE_EVENT', { event_id: newEvent.id, title });

  return res.status(201).json({ message: 'Event created successfully', event: newEvent });
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

// GET /api/events/:id/registrants (Admin view registrants)
router.get('/:id/registrants', authenticateAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const event = db.get('events', e => e.id === id);

  if (!event) {
    return res.status(404).json({ error: 'Event not found.' });
  }

  const registrants = db.all('event_registrations', r => r.event_id === id);
  return res.json({ event, registrants, count: registrants.length });
});

export default router;
