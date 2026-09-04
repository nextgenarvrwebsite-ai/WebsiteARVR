import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==========================================
// CONFIGURATION & SECRETS
// ==========================================
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'NextGen_ARVR_Secret_Key_2026!#$';
const dataDir = path.join(__dirname, 'data');
const dbFile = path.join(dataDir, 'database.json');

if (!fs.existsSync(dataDir)) {
  try { fs.mkdirSync(dataDir, { recursive: true }); } catch (e) {}
}

// ==========================================
// CLOUD DATABASE LAYER (Postgres / Supabase)
// ==========================================
let pgPool = null;
let supabaseClient = null;
let isCloudDbActive = false;

function initCloudDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

  if (databaseUrl) {
    try {
      console.log('📡 Connecting to Cloud PostgreSQL database...');
      pgPool = new Pool({
        connectionString: databaseUrl,
        ssl: databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false }
      });
      pgPool.query('SELECT NOW()', (err, res) => {
        if (err) {
          console.error('⚠️ PostgreSQL connection notice:', err.message);
        } else {
          isCloudDbActive = true;
          console.log('✅ Cloud PostgreSQL Connected successfully at:', res.rows[0].now);
          setupPostgresTables();
        }
      });
    } catch (err) {
      console.error('Error initializing PostgreSQL pool:', err);
    }
  } else if (supabaseUrl && supabaseKey) {
    try {
      console.log('📡 Connecting to Supabase Cloud API...');
      supabaseClient = createClient(supabaseUrl, supabaseKey);
      isCloudDbActive = true;
      console.log('✅ Supabase Client initialized for:', supabaseUrl);
    } catch (err) {
      console.error('Error initializing Supabase client:', err);
    }
  } else {
    console.log('💾 Cloud Database variables not detected. Operating with local database persistence (database.json).');
  }
}

async function setupPostgresTables() {
  if (!pgPool) return;
  const schemaSql = `
    CREATE TABLE IF NOT EXISTS applications (
      id SERIAL PRIMARY KEY,
      full_name TEXT NOT NULL,
      roll_no TEXT NOT NULL,
      branch TEXT,
      year TEXT,
      email TEXT,
      phone TEXT,
      domains TEXT,
      why_join TEXT,
      experience TEXT,
      portfolio_url TEXT,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS event_registrations (
      id SERIAL PRIMARY KEY,
      event_id INT,
      full_name TEXT NOT NULL,
      roll_no TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      branch TEXT,
      year TEXT,
      is_team BOOLEAN DEFAULT false,
      team_name TEXT,
      team_members_info TEXT,
      ticket_id TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS feedback (
      id SERIAL PRIMARY KEY,
      event_id INT,
      event_title TEXT,
      rating_content INT,
      rating_organization INT,
      rating_speaker INT,
      what_liked TEXT,
      what_improve TEXT,
      comments TEXT,
      author_name TEXT,
      author_email TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `;
  try {
    await pgPool.query(schemaSql);
    console.log('✅ Cloud PostgreSQL tables verified');
  } catch (err) {
    console.error('Error verifying PostgreSQL tables:', err.message);
  }
}

async function syncToCloud(table, row) {
  sendWebhookNotification(table, row);
  if (!isCloudDbActive) return;

  try {
    if (pgPool) {
      if (table === 'applications') {
        const query = `
          INSERT INTO applications (full_name, roll_no, branch, year, email, phone, domains, why_join, experience, portfolio_url, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `;
        const values = [
          row.full_name, row.roll_no, row.branch || '', row.year || '', row.email || '', row.phone || '',
          Array.isArray(row.domains) ? row.domains.join(', ') : (row.domains || ''),
          row.why_join || '', row.experience || '', row.portfolio_url || '', row.status || 'pending'
        ];
        await pgPool.query(query, values);
      } else if (table === 'event_registrations') {
        const query = `
          INSERT INTO event_registrations (event_id, full_name, roll_no, email, phone, branch, year, is_team, team_name, team_members_info, ticket_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `;
        const values = [
          row.event_id, row.full_name, row.roll_no, row.email || '', row.phone || '', row.branch || '',
          row.year || '', Boolean(row.is_team), row.team_name || '', row.team_members_info || '', row.ticket_id || ''
        ];
        await pgPool.query(query, values);
      } else if (table === 'feedback') {
        const query = `
          INSERT INTO feedback (event_id, event_title, rating_content, rating_organization, rating_speaker, what_liked, what_improve, comments, author_name, author_email)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `;
        const values = [
          row.event_id || null, row.event_title || '', row.rating_content || 5, row.rating_organization || 5,
          row.rating_speaker || 5, row.what_liked || '', row.what_improve || '', row.comments || '',
          row.author_name || 'Anonymous', row.author_email || ''
        ];
        await pgPool.query(query, values);
      }
    } else if (supabaseClient) {
      await supabaseClient.from(table).insert([row]);
    }
  } catch (err) {
    console.error(`Error syncing to cloud DB (${table}):`, err.message);
  }
}

function sendWebhookNotification(table, row) {
  const webhookUrl = process.env.NOTIFICATION_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  let title = 'NextGen AR/VR Portal Alert';
  let description = '';

  if (table === 'applications') {
    title = '🚀 New Club Application Received!';
    description = `**Name**: ${row.full_name}\n**Roll No**: ${row.roll_no}\n**Branch**: ${row.branch} (${row.year})\n**Email**: ${row.email}\n**Domains**: ${Array.isArray(row.domains) ? row.domains.join(', ') : row.domains}`;
  } else if (table === 'event_registrations') {
    title = '🎟️ New Event Ticket Registered!';
    description = `**Attendee**: ${row.full_name} (${row.roll_no})\n**Ticket ID**: ${row.ticket_id}\n**Mode**: ${row.is_team ? `Team (${row.team_name})` : 'Solo'}`;
  } else if (table === 'feedback') {
    title = '⭐ New Event Feedback Submitted!';
    description = `**Event**: ${row.event_title}\n**Ratings**: Content: ${row.rating_content}★ | Org: ${row.rating_organization}★ | Speaker: ${row.rating_speaker}★`;
  } else {
    return;
  }

  fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: `🔔 **${title}**\n${description}` })
  }).catch(() => {});
}

// ==========================================
// IN-MEMORY & JSON DATABASE ENGINE
// ==========================================
let state = {
  admins: [],
  members: [],
  applications: [],
  events: [],
  event_registrations: [],
  feedback: [],
  esports_games: [],
  esports_tournaments: [],
  esports_teams: [],
  esports_matches: [],
  site_content: {},
  audit_logs: []
};

function saveToDisk() {
  try {
    fs.writeFileSync(dbFile, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {}
}

function loadFromDisk() {
  if (fs.existsSync(dbFile)) {
    try {
      const data = fs.readFileSync(dbFile, 'utf-8');
      if (data && data.trim()) state = JSON.parse(data);
    } catch (err) {}
  }
}

const db = {
  all(table, predicate = () => true) {
    if (!state[table]) return [];
    return state[table].filter(predicate);
  },
  get(table, predicate) {
    if (!state[table]) return null;
    return state[table].find(predicate) || null;
  },
  insert(table, row) {
    if (!state[table]) state[table] = [];
    const id = state[table].length > 0 ? Math.max(...state[table].map(r => r.id || 0)) + 1 : 1;
    const newRecord = { id, ...row, created_at: row.created_at || new Date().toISOString() };
    state[table].push(newRecord);
    saveToDisk();
    syncToCloud(table, newRecord);
    return newRecord;
  },
  update(table, predicate, updateData) {
    if (!state[table]) return null;
    const index = state[table].findIndex(predicate);
    if (index === -1) return null;
    state[table][index] = { ...state[table][index], ...updateData, updated_at: new Date().toISOString() };
    saveToDisk();
    return state[table][index];
  },
  delete(table, predicate) {
    if (!state[table]) return false;
    const initialLen = state[table].length;
    state[table] = state[table].filter(r => !predicate(r));
    saveToDisk();
    return state[table].length < initialLen;
  },
  count(table, predicate = () => true) {
    if (!state[table]) return 0;
    return state[table].filter(predicate).length;
  },
  getSetting(key, defaultValue = null) {
    return state.site_content && state.site_content[key] !== undefined ? state.site_content[key] : defaultValue;
  },
  setSetting(key, value) {
    if (!state.site_content) state.site_content = {};
    state.site_content[key] = value;
    saveToDisk();
    return value;
  }
};

// ==========================================
// SEED INITIAL DATABASE
// ==========================================
function seedInitialData() {
  loadFromDisk();
  initCloudDatabase();

  if (!state.admins || state.admins.length === 0) {
    const salt = bcrypt.genSaltSync(10);
    state.admins = [{
      id: 1,
      username: 'admin',
      email: 'admin@nextgenarvr.club',
      password_hash: bcrypt.hashSync('Admin@NextGen2026!', salt),
      role: 'super_admin',
      created_at: new Date().toISOString()
    }];
    console.log('✅ Default Admin: admin@nextgenarvr.club / Admin@NextGen2026!');
  }

  if (!state.site_content || Object.keys(state.site_content).length === 0) {
    state.site_content = {
      recruitment_status: {
        is_open: true,
        batch_name: 'Fall 2026 Cohort',
        deadline: '2026-09-15',
        banner_message: '🚀 Fall 2026 Recruitment is LIVE! Applications are open across all technical & creative domains.'
      },
      announcement_banner: {
        active: true,
        title: 'Meta XR Hackathon 2026 Registrations Open!',
        link: '/events',
        badge: 'FEATURED'
      },
      club_stats: {
        members_count: '250+',
        projects_count: '24+',
        events_hosted: '50+',
        esports_pool_won: '$15,000+'
      },
      contact_info: {
        email: 'contact@nextgenarvr.club',
        lab_location: 'Spatial Computing Lab, Room 402, Technology Block A',
        discord: 'https://discord.gg/nextgen-arvr',
        instagram: 'https://instagram.com/nextgen_arvr',
        linkedin: 'https://linkedin.com/company/nextgen-arvr-club',
        github: 'https://github.com/nextgen-arvr-club'
      }
    };
  }

  if (!state.members || state.members.length === 0) {
    state.members = [
      {
        id: 1,
        full_name: 'Dr. Rajeshwari Sharma',
        roll_no: 'FAC-CSE-012',
        branch: 'Computer Science & Engineering',
        year: 'Faculty',
        domain: 'AR/VR & Spatial Computing',
        role: 'Faculty Coordinator & Mentor',
        email: 'rajeshwari.sharma@college.edu',
        bio: 'Associate Professor specializing in Extended Reality (XR) and Computer Vision.',
        avatar_url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=400',
        status: 'core_team'
      },
      {
        id: 2,
        full_name: 'Aarav Mehta',
        roll_no: '22CS089',
        branch: 'Computer Science',
        year: 'Final Year (4th)',
        domain: 'AR/VR & Spatial Computing',
        role: 'President & XR Lead',
        email: 'aarav.mehta@nextgenarvr.club',
        bio: 'Building WebXR and Unity 3D spatial simulations.',
        avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=400',
        status: 'core_team'
      },
      {
        id: 3,
        full_name: 'Diya Sen',
        roll_no: '23IT044',
        branch: 'Information Technology',
        year: '3rd Year',
        domain: 'Game Development',
        role: 'Vice President & Unreal Dev Lead',
        email: 'diya.sen@nextgenarvr.club',
        bio: 'Unreal Engine 5 enthusiast and C++ gameplay programmer.',
        avatar_url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&q=80&w=400',
        status: 'core_team'
      },
      {
        id: 4,
        full_name: 'Rohan Varma',
        roll_no: '22ECE051',
        branch: 'Electronics & Comm.',
        year: '4th Year',
        domain: 'E-Sports Division',
        role: 'E-Sports Operations Head',
        email: 'rohan.varma@nextgenarvr.club',
        bio: 'National collegiate Valorant & BGMI tournament organizer.',
        avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=400',
        status: 'core_team'
      }
    ];
  }

  if (!state.events || state.events.length === 0) {
    state.events = [
      {
        id: 1,
        title: 'Meta Spatial Hackathon 2026',
        slug: 'meta-spatial-hackathon-2026',
        category: 'Hackathon',
        event_date: '2026-09-26',
        event_time: '09:00 AM - 06:00 PM',
        venue: 'Main Auditorium & Spatial VR Lab',
        description: '36-hour intensive hackathon building spatial applications using Meta Quest 3 and WebXR. $3,000+ prize pool.',
        poster_url: 'https://images.unsplash.com/photo-1592478411213-6153e4ebc07d?auto=format&fit=crop&q=80&w=800',
        is_registration_open: 1,
        max_seats: 120,
        is_team_event: 1,
        max_team_size: 4,
        tags: 'Meta Quest 3, WebXR, Unity, Prizes'
      },
      {
        id: 2,
        title: 'Unreal Engine 5.5 Masterclass: Nanite & Lumen',
        slug: 'unreal-engine-5-masterclass',
        category: 'Workshop',
        event_date: '2026-09-08',
        event_time: '02:00 PM - 05:30 PM',
        venue: 'Computer Center Lab 3',
        description: 'Hands-on practical workshop covering next-gen photorealistic game environment rendering.',
        poster_url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&q=80&w=800',
        is_registration_open: 1,
        max_seats: 60,
        is_team_event: 0,
        max_team_size: 1,
        tags: 'Unreal Engine, Shaders, Game Dev'
      }
    ];
  }

  if (!state.esports_tournaments || state.esports_tournaments.length === 0) {
    state.esports_tournaments = [{
      id: 1,
      title: 'NextGen Pro Apex League Season 4',
      slug: 'nextgen-pro-apex-season-4',
      game_name: 'BGMI / Battle Royale League',
      prize_pool: '₹50,000 INR (~$600 USD)',
      status: 'live',
      banner_url: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&q=80&w=800'
    }];

    state.esports_teams = [
      { id: 1, tournament_id: 1, team_name: 'Vortex Phantom', tag: 'VP', logo_url: '⚡', captain_name: 'Samar Singh', matches_played: 5, wins: 2, kills: 42, placement_points: 58, kill_points: 42, bonus_points: 10, total_points: 110, rank: 1 },
      { id: 2, tournament_id: 1, team_name: 'Cyber Valkyries', tag: 'CVK', logo_url: '🦅', captain_name: 'Rhea Sen', matches_played: 5, wins: 1, kills: 38, placement_points: 52, kill_points: 38, bonus_points: 5, total_points: 95, rank: 2 },
      { id: 3, tournament_id: 1, team_name: 'HyperDrive Gaming', tag: 'HDG', logo_url: '🔥', captain_name: 'Aditya Rao', matches_played: 5, wins: 1, kills: 34, placement_points: 44, kill_points: 34, bonus_points: 5, total_points: 83, rank: 3 }
    ];
  }

  saveToDisk();
}

seedInitialData();

// ==========================================
// EXPRESS SERVER & MIDDLEWARE
// ==========================================
const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

function authenticateAdmin(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'Access denied. No authorization token provided.' });
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }
}

// ==========================================
// API ROUTES
// ==========================================

// 1. Health check & Landing
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    cloudDbActive: isCloudDbActive,
    club: 'NextGen AR/VR Portal',
    version: '1.0.0'
  });
});

app.get('/', (req, res) => {
  res.status(200).send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>NextGen AR/VR — Backend API Service</title>
        <style>
          body { background: #07090E; color: #F1F5F9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
          .card { background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(0, 240, 255, 0.25); border-radius: 16px; padding: 2.5rem; max-width: 580px; width: 100%; box-shadow: 0 20px 40px rgba(0,0,0,0.6); }
          h1 { color: #00F0FF; margin-top: 0; font-size: 1.6rem; }
          .badge { display: inline-block; background: rgba(0, 255, 157, 0.15); border: 1px solid #00FF9D; color: #00FF9D; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.85rem; font-weight: 600; margin-bottom: 1.25rem; }
          p { color: #94A3B8; line-height: 1.6; }
          ul { list-style: none; padding: 0; margin: 1.5rem 0; }
          li { padding: 0.5rem 0; border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: space-between; font-family: monospace; font-size: 0.9rem; }
          a { color: #00F0FF; text-decoration: none; }
        </style>
      </head>
      <body>
        <div class="card">
          <span class="badge">● Online & Operational ${isCloudDbActive ? '(Cloud DB Synced)' : ''}</span>
          <h1>NextGen AR/VR Portal API</h1>
          <p>The backend REST API server is actively running on Render. Ready to accept requests from your Netlify frontend.</p>
          <ul>
            <li><span>Health Check:</span> <a href="/api/health" target="_blank">/api/health</a></li>
            <li><span>Events API:</span> <a href="/api/events" target="_blank">/api/events</a></li>
            <li><span>Members API:</span> <a href="/api/members" target="_blank">/api/members</a></li>
            <li><span>Esports API:</span> <a href="/api/esports/overview" target="_blank">/api/esports/overview</a></li>
          </ul>
        </div>
      </body>
    </html>
  `);
});

// 2. Auth Routes
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
  const cleanEmail = email.trim().toLowerCase();
  const admin = db.get('admins', a => (a.email && a.email.toLowerCase() === cleanEmail) || a.username === email.trim());
  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  const token = jwt.sign({ id: admin.id, email: admin.email, username: admin.username, role: admin.role }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, admin: { id: admin.id, email: admin.email, username: admin.username, role: admin.role } });
});

app.get('/api/auth/verify', authenticateAdmin, (req, res) => {
  res.json({ valid: true, admin: req.admin });
});

// 3. Events Routes
app.get('/api/events', (req, res) => {
  const events = db.all('events').map(e => {
    const regCount = db.count('event_registrations', r => r.event_id === e.id);
    return { ...e, total_registrants: regCount, spots_remaining: Math.max(0, (e.max_seats || 100) - regCount) };
  });
  res.json({ events });
});

app.post('/api/events/:id/register', (req, res) => {
  const eventId = parseInt(req.params.id, 10);
  const event = db.get('events', e => e.id === eventId);
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  const ticketId = `NG-${event.category.slice(0, 3).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const reg = db.insert('event_registrations', { event_id: eventId, ...req.body, ticket_id: ticketId });
  res.status(201).json({ message: 'Registration confirmed!', registration_id: reg.id, ticket_id: ticketId });
});

app.get('/api/events/:id/registrants', authenticateAdmin, (req, res) => {
  const eventId = parseInt(req.params.id, 10);
  const registrants = db.all('event_registrations', r => r.event_id === eventId);
  res.json({ registrants });
});

// 4. Applications (Join Club)
app.post('/api/applications', (req, res) => {
  const { full_name, roll_no, email } = req.body;
  if (!full_name || !roll_no || !email) return res.status(400).json({ error: 'Required fields missing' });

  const appRecord = db.insert('applications', { ...req.body, status: 'pending' });
  const trackingCode = `NEXTGEN-APP-${String(appRecord.id).padStart(4, '0')}`;
  db.update('applications', a => a.id === appRecord.id, { tracking_code: trackingCode });
  res.status(201).json({ message: 'Application submitted successfully!', application_id: appRecord.id, tracking_code: trackingCode });
});

app.get('/api/applications', authenticateAdmin, (req, res) => {
  const status = req.query.status;
  const applications = db.all('applications', a => !status || status === 'all' || a.status === status);
  res.json({ applications });
});

app.put('/api/applications/:id/review', authenticateAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { status, review_notes } = req.body;
  const updated = db.update('applications', a => a.id === id, { status, review_notes });
  if (!updated) return res.status(404).json({ error: 'Application not found' });

  // If approved, automatically convert to active member
  let createdMember = null;
  if (status === 'approved') {
    const existing = db.get('members', m => m.roll_no === updated.roll_no);
    if (!existing) {
      createdMember = db.insert('members', {
        full_name: updated.full_name,
        roll_no: updated.roll_no,
        branch: updated.branch,
        year: updated.year,
        email: updated.email,
        phone: updated.phone,
        domain: Array.isArray(updated.domains) ? updated.domains[0] : (updated.domains || 'General Member'),
        role: 'Member',
        bio: updated.why_join?.slice(0, 150) || '',
        avatar_url: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(updated.full_name)}`,
        status: 'active'
      });
    }
  }
  res.json({ message: `Application ${status}!`, application: updated, createdMember });
});

// 5. Members Directory
app.get('/api/members', (req, res) => {
  const { domain, status } = req.query;
  const members = db.all('members', m => {
    if (domain && domain !== 'all' && !m.domain?.toLowerCase().includes(domain.toLowerCase())) return false;
    if (status && status !== 'all' && m.status !== status) return false;
    return true;
  });
  res.json({ members });
});

app.post('/api/members', authenticateAdmin, (req, res) => {
  const member = db.insert('members', req.body);
  res.status(201).json({ message: 'Member added', member });
});

app.put('/api/members/:id', authenticateAdmin, (req, res) => {
  const updated = db.update('members', m => m.id === parseInt(req.params.id, 10), req.body);
  res.json({ message: 'Member updated', member: updated });
});

app.delete('/api/members/:id', authenticateAdmin, (req, res) => {
  db.delete('members', m => m.id === parseInt(req.params.id, 10));
  res.json({ message: 'Member deleted' });
});

// 6. Esports Hub & Points Calculator
app.get('/api/esports/overview', (req, res) => {
  res.json({
    tournaments: db.all('esports_tournaments'),
    teams: db.all('esports_teams'),
    recentMatches: db.all('esports_matches')
  });
});

app.get('/api/esports/tournaments/:id/leaderboard', (req, res) => {
  const tourId = parseInt(req.params.id, 10);
  const tournament = db.get('esports_tournaments', t => t.id === tourId);
  const leaderboard = db.all('esports_teams', tm => tm.tournament_id === tourId).sort((a, b) => b.total_points - a.total_points);
  res.json({
    tournament,
    podium: { first: leaderboard[0] || null, second: leaderboard[1] || null, third: leaderboard[2] || null },
    leaderboard
  });
});

app.post('/api/esports/calculate', (req, res) => {
  const { scoring_type, placement, kills, is_win } = req.body;
  let pPts = 0;
  let kPts = (parseInt(kills, 10) || 0) * 1;
  let bPts = (is_win || placement === 1) ? 5 : 0;
  let formula = '';

  if (scoring_type === 'battle_royale') {
    const scale = { 1: 15, 2: 12, 3: 10, 4: 8, 5: 6, 6: 4, 7: 2, 8: 1, 9: 1, 10: 1 };
    pPts = scale[placement] || 0;
    formula = `(${pPts} Placement Pts) + (${kPts} Kill Pts) + (${bPts} Bonus Pts)`;
  } else {
    pPts = is_win ? 3 : 0;
    formula = `(${pPts} Match Win Pts) + (${kPts} Frag Pts)`;
  }

  res.json({
    result: { placement_points: pPts, kill_points: kPts, bonus_points: bPts, total_points: pPts + kPts + bPts, formula }
  });
});

// 7. Feedback Collection
app.post('/api/feedback', (req, res) => {
  const entry = db.insert('feedback', req.body);
  res.status(201).json({ message: 'Feedback recorded. Thank you!', feedback_id: entry.id });
});

app.get('/api/feedback', authenticateAdmin, (req, res) => {
  const feedback = db.all('feedback');
  res.json({ feedback });
});

// 8. CMS Settings & Stats
app.get('/api/cms/settings', (req, res) => {
  res.json(state.site_content || {});
});

app.put('/api/cms/settings', authenticateAdmin, (req, res) => {
  const { key, value } = req.body;
  db.setSetting(key, value);
  res.json({ message: 'Settings updated' });
});

app.get('/api/cms/dashboard-stats', authenticateAdmin, (req, res) => {
  res.json({
    metrics: {
      totalMembers: db.count('members'),
      pendingApplications: db.count('applications', a => a.status === 'pending'),
      upcomingEvents: db.count('events'),
      totalFeedback: db.count('feedback')
    }
  });
});

// 9. CSV Data Exports
app.get('/api/admin/export/applications.csv', authenticateAdmin, (req, res) => {
  const apps = db.all('applications');
  let csv = 'ID,Full Name,Roll No,Branch,Year,Email,Phone,Domains,Status,Submitted At\n';
  apps.forEach(a => {
    csv += `"${a.id}","${a.full_name}","${a.roll_no}","${a.branch}","${a.year}","${a.email}","${a.phone}","${Array.isArray(a.domains)?a.domains.join(';'):a.domains}","${a.status}","${a.created_at}"\n`;
  });
  res.header('Content-Type', 'text/csv');
  res.attachment('applications_export.csv');
  res.send(csv);
});

app.get('/api/admin/export/members.csv', authenticateAdmin, (req, res) => {
  const members = db.all('members');
  let csv = 'ID,Full Name,Roll No,Branch,Year,Domain,Role,Email,Status\n';
  members.forEach(m => {
    csv += `"${m.id}","${m.full_name}","${m.roll_no}","${m.branch}","${m.year}","${m.domain}","${m.role}","${m.email}","${m.status}"\n`;
  });
  res.header('Content-Type', 'text/csv');
  res.attachment('members_export.csv');
  res.send(csv);
});

// ==========================================
// START HTTP SERVER
// ==========================================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`🚀 NextGen AR/VR Portal API Server running on port ${PORT}`);
  console.log(`🌐 Base URL: http://0.0.0.0:${PORT}`);
  console.log(`🔑 Admin Login: admin@nextgenarvr.club / Admin@NextGen2026!`);
  console.log(`======================================================\n`);
});
