import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

const { Pool } = pg;

let pgPool = null;
let supabaseClient = null;
let isPostgresConnected = false;
let isSupabaseConnected = false;
let connectionType = 'none'; // 'postgres' (direct URI) or 'supabase_api' (URL + key)
let lastError = null;

export function isPostgresActive() {
  return isPostgresConnected || isSupabaseConnected;
}

export function getPostgresStatus() {
  return {
    isActive: isPostgresActive(),
    connectionType,
    isPostgresConnected,
    isSupabaseConnected,
    lastError: lastError ? lastError.message || String(lastError) : null
  };
}

/**
 * Initializes connection to Supabase / PostgreSQL cloud database.
 */
export async function initPostgresDatabase(onReadyCallback) {
  // 1. Direct PostgreSQL Connection String (Supabase Connection URI, Render Postgres, Neon, Railway)
  const connectionString = process.env.DATABASE_URL || 
                           process.env.SUPABASE_DB_URL || 
                           process.env.POSTGRES_URL || 
                           process.env.POSTGRESQL_URI;

  // 2. Supabase Cloud API credentials
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 
                      process.env.SUPABASE_KEY || 
                      process.env.SUPABASE_ANON_KEY || 
                      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (connectionString && !connectionString.startsWith('mongodb')) {
    try {
      console.log('📡 Connecting to PostgreSQL Cloud Database (Supabase / Postgres)...');
      pgPool = new Pool({
        connectionString,
        ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
        connectionTimeoutMillis: 10000
      });

      // Test connection
      const testRes = await pgPool.query('SELECT NOW()');
      isPostgresConnected = true;
      connectionType = 'postgres';
      console.log('✅ Cloud PostgreSQL Connected successfully! Server time:', testRes.rows[0].now);

      await verifyAndCreateTables();

      if (onReadyCallback) {
        await onReadyCallback();
      }
      return true;
    } catch (err) {
      lastError = err;
      console.error('❌ Failed to connect to Cloud PostgreSQL:', err.message);
    }
  }

  // Fallback to Supabase API Client if URL and Key provided
  if (supabaseUrl && supabaseKey) {
    try {
      console.log('📡 Initializing Supabase REST API Client for:', supabaseUrl);
      supabaseClient = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false }
      });
      isSupabaseConnected = true;
      connectionType = 'supabase_api';
      console.log('✅ Supabase REST API Client connected successfully!');

      if (onReadyCallback) {
        await onReadyCallback();
      }
      return true;
    } catch (err) {
      lastError = err;
      console.error('❌ Failed to initialize Supabase Client:', err.message);
    }
  }

  return false;
}

/**
 * Creates all required schema tables in PostgreSQL if they don't already exist.
 */
async function verifyAndCreateTables() {
  if (!pgPool) return;

  const ddl = `
    CREATE TABLE IF NOT EXISTS events (
      id BIGINT PRIMARY KEY,
      title TEXT NOT NULL,
      slug TEXT,
      category TEXT DEFAULT 'Workshop',
      event_date TEXT,
      event_time TEXT,
      venue TEXT,
      description TEXT,
      poster_url TEXT,
      is_registration_open INT DEFAULT 1,
      max_seats INT DEFAULT 100,
      is_team_event INT DEFAULT 0,
      max_team_size INT DEFAULT 4,
      tags JSONB DEFAULT '[]'::jsonb,
      feedback_questions JSONB DEFAULT '[]'::jsonb,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS members (
      id BIGINT PRIMARY KEY,
      full_name TEXT NOT NULL,
      roll_no TEXT DEFAULT '',
      branch TEXT DEFAULT '',
      school TEXT DEFAULT '',
      year TEXT DEFAULT '',
      domain TEXT DEFAULT '',
      role TEXT DEFAULT '',
      designation TEXT DEFAULT '',
      email TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      bio TEXT DEFAULT '',
      avatar_url TEXT DEFAULT '',
      github_url TEXT DEFAULT '',
      linkedin_url TEXT DEFAULT '',
      portfolio_url TEXT DEFAULT '',
      status TEXT DEFAULT 'active',
      is_faculty BOOLEAN DEFAULT false,
      is_council BOOLEAN DEFAULT false,
      badge TEXT DEFAULT '',
      joined_at TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS event_registrations (
      id SERIAL PRIMARY KEY,
      event_id BIGINT,
      full_name TEXT NOT NULL,
      roll_no TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      school TEXT DEFAULT '',
      branch TEXT,
      department TEXT DEFAULT '',
      year TEXT,
      semester TEXT DEFAULT '',
      is_team BOOLEAN DEFAULT false,
      team_name TEXT,
      team_members_info TEXT,
      ticket_id TEXT,
      status TEXT DEFAULT 'confirmed',
      registered_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id SERIAL PRIMARY KEY,
      event_id BIGINT,
      event_title TEXT,
      participant_name TEXT,
      register_no TEXT,
      email TEXT,
      department TEXT,
      rating_content INT DEFAULT 5,
      rating_organization INT DEFAULT 5,
      rating_speaker INT DEFAULT 5,
      what_liked TEXT,
      what_improve TEXT,
      comments TEXT,
      answers JSONB DEFAULT '{}'::jsonb,
      submitted_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS applications (
      id SERIAL PRIMARY KEY,
      full_name TEXT NOT NULL,
      roll_no TEXT NOT NULL,
      branch TEXT,
      year TEXT,
      email TEXT,
      phone TEXT,
      domains JSONB DEFAULT '[]'::jsonb,
      why_join TEXT,
      experience TEXT,
      portfolio_url TEXT,
      status TEXT DEFAULT 'pending',
      review_notes TEXT,
      submitted_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS site_content (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS admins (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'super_admin',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      last_login TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS esports_games (
      id BIGINT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT,
      icon TEXT,
      banner_url TEXT,
      format TEXT,
      scoring_type TEXT,
      default_rules JSONB DEFAULT '{}'::jsonb,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS esports_tournaments (
      id BIGINT PRIMARY KEY,
      title TEXT NOT NULL,
      slug TEXT,
      game_id BIGINT,
      game_name TEXT,
      prize_pool TEXT,
      status TEXT,
      start_date TEXT,
      end_date TEXT,
      venue TEXT,
      banner_url TEXT,
      registration_open INT DEFAULT 1,
      scoring_rules JSONB DEFAULT '{}'::jsonb,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS esports_teams (
      id BIGINT PRIMARY KEY,
      tournament_id BIGINT,
      slot INT,
      team_name TEXT NOT NULL,
      tag TEXT,
      logo_url TEXT,
      captain_name TEXT,
      captain_contact TEXT,
      members JSONB DEFAULT '[]'::jsonb,
      matches_played INT DEFAULT 0,
      wins INT DEFAULT 0,
      kills INT DEFAULT 0,
      placement_points INT DEFAULT 0,
      kill_points INT DEFAULT 0,
      bonus_points INT DEFAULT 0,
      total_points INT DEFAULT 0,
      rank INT DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS esports_matches (
      id BIGINT PRIMARY KEY,
      tournament_id BIGINT,
      match_title TEXT,
      match_number INT,
      map_name TEXT,
      played_at TEXT,
      mvp_player TEXT,
      results JSONB DEFAULT '[]'::jsonb
    );
  `;

  try {
    await pgPool.query(ddl);
    // Migration: ensure new columns exist
    await pgPool.query(`
      ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS school TEXT DEFAULT '';
      ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS department TEXT DEFAULT '';
      ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS semester TEXT DEFAULT '';
    `).catch(() => {});
    console.log('✅ PostgreSQL / Supabase tables verified: events, members, registrations, feedback, applications, site_content, admins, esports');
  } catch (err) {
    console.error('Error verifying PostgreSQL tables:', err.message);
  }
}

/**
 * Hydrates local in-memory state from PostgreSQL / Supabase on startup
 */
export async function loadAllFromPostgres(state) {
  if (isPostgresConnected && pgPool) {
    try {
      let totalLoaded = 0;

      // 1. Events
      const eventsRes = await pgPool.query('SELECT * FROM events ORDER BY id ASC');
      if (eventsRes.rows && eventsRes.rows.length > 0) {
        state.events = eventsRes.rows.map(r => ({
          ...r,
          id: Number(r.id),
          tags: Array.isArray(r.tags) ? r.tags : [],
          feedbackQuestions: Array.isArray(r.feedback_questions) ? r.feedback_questions : []
        }));
        totalLoaded += eventsRes.rows.length;
      }

      // 2. Members
      const membersRes = await pgPool.query('SELECT * FROM members ORDER BY id ASC');
      if (membersRes.rows && membersRes.rows.length > 0) {
        state.members = membersRes.rows.map(r => ({ ...r, id: Number(r.id) }));
        totalLoaded += membersRes.rows.length;
      }

      // 3. Registrations
      const regsRes = await pgPool.query('SELECT * FROM event_registrations ORDER BY id ASC');
      if (regsRes.rows && regsRes.rows.length > 0) {
        state.event_registrations = regsRes.rows.map(r => ({ ...r, id: Number(r.id), event_id: Number(r.event_id) }));
        totalLoaded += regsRes.rows.length;
      }

      // 4. Feedback
      const fbRes = await pgPool.query('SELECT * FROM feedback ORDER BY id ASC');
      if (fbRes.rows && fbRes.rows.length > 0) {
        state.feedback = fbRes.rows.map(r => ({ ...r, id: Number(r.id), event_id: Number(r.event_id) }));
        totalLoaded += fbRes.rows.length;
      }

      // 5. Applications
      const appsRes = await pgPool.query('SELECT * FROM applications ORDER BY id ASC');
      if (appsRes.rows && appsRes.rows.length > 0) {
        state.applications = appsRes.rows.map(r => ({
          ...r,
          id: Number(r.id),
          domains: Array.isArray(r.domains) ? r.domains : []
        }));
        totalLoaded += appsRes.rows.length;
      }

      // 6. Site Content
      const cmsRes = await pgPool.query('SELECT key, value FROM site_content');
      if (cmsRes.rows && cmsRes.rows.length > 0) {
        if (!state.site_content) state.site_content = {};
        for (const row of cmsRes.rows) {
          state.site_content[row.key] = row.value;
        }
      }

      // 7. Esports Games
      const gamesRes = await pgPool.query('SELECT * FROM esports_games ORDER BY id ASC');
      if (gamesRes.rows && gamesRes.rows.length > 0) {
        state.esports_games = gamesRes.rows.map(r => ({
          ...r,
          id: Number(r.id),
          default_rules: r.default_rules || {}
        }));
        totalLoaded += gamesRes.rows.length;
      }

      // 8. Esports Tournaments
      const tournRes = await pgPool.query('SELECT * FROM esports_tournaments ORDER BY id ASC');
      if (tournRes.rows && tournRes.rows.length > 0) {
        state.esports_tournaments = tournRes.rows.map(r => ({
          ...r,
          id: Number(r.id),
          game_id: Number(r.game_id),
          registration_open: Number(r.registration_open || 1),
          scoring_rules: r.scoring_rules || {}
        }));
        totalLoaded += tournRes.rows.length;
      }

      // 9. Esports Teams
      const teamsRes = await pgPool.query('SELECT * FROM esports_teams ORDER BY tournament_id ASC, rank ASC');
      if (teamsRes.rows && teamsRes.rows.length > 0) {
        state.esports_teams = teamsRes.rows.map(r => ({
          ...r,
          id: Number(r.id),
          tournament_id: Number(r.tournament_id),
          slot: Number(r.slot || 1),
          matches_played: Number(r.matches_played || 0),
          wins: Number(r.wins || 0),
          kills: Number(r.kills || 0),
          placement_points: Number(r.placement_points || 0),
          kill_points: Number(r.kill_points || 0),
          bonus_points: Number(r.bonus_points || 0),
          total_points: Number(r.total_points || 0),
          rank: Number(r.rank || 1),
          members: Array.isArray(r.members) ? r.members : []
        }));
        totalLoaded += teamsRes.rows.length;
      }

      // 10. Esports Matches
      const matchesRes = await pgPool.query('SELECT * FROM esports_matches ORDER BY tournament_id ASC, match_number ASC');
      if (matchesRes.rows && matchesRes.rows.length > 0) {
        state.esports_matches = matchesRes.rows.map(r => ({
          ...r,
          id: Number(r.id),
          tournament_id: Number(r.tournament_id),
          match_number: Number(r.match_number || 1),
          results: Array.isArray(r.results) ? r.results : []
        }));
        totalLoaded += matchesRes.rows.length;
      }

      console.log(`📥 Loaded ${totalLoaded} records from Supabase / PostgreSQL into active server state.`);
      return true;
    } catch (err) {
      console.error('Error loading data from PostgreSQL:', err.message);
      return false;
    }
  }

  // Supabase REST Client fallback
  if (isSupabaseConnected && supabaseClient) {
    try {
      const { data: eventsData } = await supabaseClient.from('events').select('*');
      if (Array.isArray(eventsData) && eventsData.length > 0) {
        state.events = eventsData.map(e => ({ ...e, id: Number(e.id) }));
      }
      return true;
    } catch (err) {
      console.warn('Notice loading from Supabase API client:', err.message);
    }
  }

  return false;
}

/**
 * Seeds PostgreSQL / Supabase if tables are currently empty
 */
export async function seedPostgresIfEmpty(state) {
  if (isPostgresConnected && pgPool) {
    try {
      // 1. Seed events
      const eventsCheck = await pgPool.query('SELECT COUNT(*) FROM events');
      const eventCount = parseInt(eventsCheck.rows[0].count, 10);
      if (eventCount === 0 && Array.isArray(state.events) && state.events.length > 0) {
        for (const ev of state.events) {
          await syncPostgresInsert('events', ev);
        }
        console.log(`🌱 Seeded ${state.events.length} initial events into Supabase / PostgreSQL.`);
      }

      // 2. Seed members
      const membersCheck = await pgPool.query('SELECT COUNT(*) FROM members');
      const memberCount = parseInt(membersCheck.rows[0].count, 10);
      if (memberCount === 0 && Array.isArray(state.members) && state.members.length > 0) {
        for (const m of state.members) {
          await syncPostgresInsert('members', m);
        }
        console.log(`🌱 Seeded ${state.members.length} initial members into Supabase / PostgreSQL.`);
      }

      // 3. Seed site_content
      const cmsCheck = await pgPool.query('SELECT COUNT(*) FROM site_content');
      const cmsCount = parseInt(cmsCheck.rows[0].count, 10);
      if (cmsCount === 0 && state.site_content && Object.keys(state.site_content).length > 0) {
        for (const [key, value] of Object.entries(state.site_content)) {
          await syncPostgresSetSetting(key, value);
        }
        console.log(`🌱 Seeded initial site_content settings into Supabase / PostgreSQL.`);
      }

      // 4. Seed esports_games
      const gamesCheck = await pgPool.query('SELECT COUNT(*) FROM esports_games');
      if (parseInt(gamesCheck.rows[0].count, 10) === 0 && Array.isArray(state.esports_games) && state.esports_games.length > 0) {
        for (const g of state.esports_games) {
          await syncPostgresInsert('esports_games', g);
        }
        console.log(`🌱 Seeded ${state.esports_games.length} esports games into Supabase / PostgreSQL.`);
      }

      // 5. Seed esports_tournaments
      const tournCheck = await pgPool.query('SELECT COUNT(*) FROM esports_tournaments');
      if (parseInt(tournCheck.rows[0].count, 10) === 0 && Array.isArray(state.esports_tournaments) && state.esports_tournaments.length > 0) {
        for (const t of state.esports_tournaments) {
          await syncPostgresInsert('esports_tournaments', t);
        }
        console.log(`🌱 Seeded ${state.esports_tournaments.length} esports tournaments into Supabase / PostgreSQL.`);
      }

      // 6. Seed esports_teams
      const teamsCheck = await pgPool.query('SELECT COUNT(*) FROM esports_teams');
      if (parseInt(teamsCheck.rows[0].count, 10) === 0 && Array.isArray(state.esports_teams) && state.esports_teams.length > 0) {
        for (const tm of state.esports_teams) {
          await syncPostgresInsert('esports_teams', tm);
        }
        console.log(`🌱 Seeded ${state.esports_teams.length} esports squads into Supabase / PostgreSQL.`);
      }

      // 7. Seed esports_matches
      const matchesCheck = await pgPool.query('SELECT COUNT(*) FROM esports_matches');
      if (parseInt(matchesCheck.rows[0].count, 10) === 0 && Array.isArray(state.esports_matches) && state.esports_matches.length > 0) {
        for (const m of state.esports_matches) {
          await syncPostgresInsert('esports_matches', m);
        }
        console.log(`🌱 Seeded ${state.esports_matches.length} esports matches into Supabase / PostgreSQL.`);
      }
    } catch (err) {
      console.error('Error seeding PostgreSQL:', err.message);
    }
  }
}

/**
 * Inserts a record into PostgreSQL / Supabase
 */
export async function syncPostgresInsert(table, row) {
  if (!isPostgresActive() || !row) return;

  if (isPostgresConnected && pgPool) {
    try {
      if (table === 'events') {
        const query = `
          INSERT INTO events (
            id, title, slug, category, event_date, event_time, venue, description, 
            poster_url, is_registration_open, max_seats, is_team_event, max_team_size, tags, feedback_questions, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            slug = EXCLUDED.slug,
            category = EXCLUDED.category,
            event_date = EXCLUDED.event_date,
            event_time = EXCLUDED.event_time,
            venue = EXCLUDED.venue,
            description = EXCLUDED.description,
            poster_url = EXCLUDED.poster_url,
            is_registration_open = EXCLUDED.is_registration_open,
            max_seats = EXCLUDED.max_seats,
            is_team_event = EXCLUDED.is_team_event,
            max_team_size = EXCLUDED.max_team_size,
            tags = EXCLUDED.tags,
            feedback_questions = EXCLUDED.feedback_questions
        `;
        const values = [
          Number(row.id),
          row.title || '',
          row.slug || '',
          row.category || 'Workshop',
          row.event_date || '',
          row.event_time || '',
          row.venue || '',
          row.description || '',
          row.poster_url || '',
          row.is_registration_open ? 1 : 0,
          row.max_seats || 100,
          row.is_team_event ? 1 : 0,
          row.max_team_size || 4,
          JSON.stringify(Array.isArray(row.tags) ? row.tags : []),
          JSON.stringify(Array.isArray(row.feedbackQuestions) ? row.feedbackQuestions : []),
          row.created_at || new Date().toISOString()
        ];
        await pgPool.query(query, values);
        console.log(`☁️ Synced event "${row.title}" (ID: ${row.id}) to Supabase / PostgreSQL`);
      } else if (table === 'members') {
        const query = `
          INSERT INTO members (
            id, full_name, roll_no, branch, school, year, domain, role, designation,
            email, phone, bio, avatar_url, github_url, linkedin_url, portfolio_url,
            status, is_faculty, is_council, badge, joined_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
          ON CONFLICT (id) DO UPDATE SET
            full_name = EXCLUDED.full_name,
            roll_no = EXCLUDED.roll_no,
            branch = EXCLUDED.branch,
            school = EXCLUDED.school,
            year = EXCLUDED.year,
            domain = EXCLUDED.domain,
            role = EXCLUDED.role,
            designation = EXCLUDED.designation,
            email = EXCLUDED.email,
            phone = EXCLUDED.phone,
            bio = EXCLUDED.bio,
            avatar_url = EXCLUDED.avatar_url,
            status = EXCLUDED.status,
            badge = EXCLUDED.badge
        `;
        const values = [
          Number(row.id),
          row.full_name || '',
          row.roll_no || '',
          row.branch || '',
          row.school || '',
          row.year || '',
          row.domain || '',
          row.role || '',
          row.designation || '',
          row.email || '',
          row.phone || '',
          row.bio || '',
          row.avatar_url || '',
          row.github_url || '',
          row.linkedin_url || '',
          row.portfolio_url || '',
          row.status || 'active',
          Boolean(row.is_faculty),
          Boolean(row.is_council),
          row.badge || '',
          row.joined_at || ''
        ];
        await pgPool.query(query, values);
        console.log(`☁️ Synced member "${row.full_name}" to Supabase / PostgreSQL`);
      } else if (table === 'event_registrations') {
        const query = `
          INSERT INTO event_registrations (
            event_id, full_name, roll_no, email, phone, branch, year, is_team, team_name, team_members_info, ticket_id, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `;
        const values = [
          Number(row.event_id),
          row.full_name || '',
          row.roll_no || '',
          row.email || '',
          row.phone || '',
          row.branch || '',
          row.year || '',
          Boolean(row.is_team),
          row.team_name || '',
          row.team_members_info || '',
          row.ticket_id || '',
          row.status || 'confirmed'
        ];
        await pgPool.query(query, values);
        console.log(`☁️ Synced registration for ${row.full_name} to Supabase / PostgreSQL`);
      } else if (table === 'feedback') {
        const query = `
          INSERT INTO feedback (
            event_id, event_title, participant_name, register_no, email, department,
            rating_content, rating_organization, rating_speaker, what_liked, what_improve, comments, answers
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `;
        const values = [
          row.event_id ? Number(row.event_id) : null,
          row.event_title || '',
          row.participant_name || '',
          row.register_no || '',
          row.email || '',
          row.department || '',
          row.rating_content || 5,
          row.rating_organization || 5,
          row.rating_speaker || 5,
          row.what_liked || '',
          row.what_improve || '',
          row.comments || '',
          JSON.stringify(row.answers || {})
        ];
        await pgPool.query(query, values);
        console.log(`☁️ Synced feedback for event "${row.event_title}" to Supabase / PostgreSQL`);
      } else if (table === 'applications') {
        const query = `
          INSERT INTO applications (
            full_name, roll_no, branch, year, email, phone, domains, why_join, experience, portfolio_url, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `;
        const values = [
          row.full_name || '',
          row.roll_no || '',
          row.branch || '',
          row.year || '',
          row.email || '',
          row.phone || '',
          JSON.stringify(Array.isArray(row.domains) ? row.domains : []),
          row.why_join || '',
          row.experience || '',
          row.portfolio_url || '',
          row.status || 'pending'
        ];
        await pgPool.query(query, values);
        console.log(`☁️ Synced application for ${row.full_name} to Supabase / PostgreSQL`);
      } else if (table === 'esports_tournaments') {
        const query = `
          INSERT INTO esports_tournaments (
            id, title, slug, game_id, game_name, prize_pool, status, start_date, end_date, venue, banner_url, registration_open, scoring_rules, description
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            scoring_rules = EXCLUDED.scoring_rules,
            status = EXCLUDED.status,
            prize_pool = EXCLUDED.prize_pool,
            description = EXCLUDED.description
        `;
        await pgPool.query(query, [
          Number(row.id), row.title || '', row.slug || '', Number(row.game_id || 1), row.game_name || '',
          row.prize_pool || '', row.status || 'live', row.start_date || '', row.end_date || '',
          row.venue || '', row.banner_url || '', Number(row.registration_open || 1),
          JSON.stringify(row.scoring_rules || {}), row.description || ''
        ]);
        console.log(`☁️ Synced esports tournament "${row.title}" to Supabase / PostgreSQL`);
      } else if (table === 'esports_teams') {
        const query = `
          INSERT INTO esports_teams (
            id, tournament_id, slot, team_name, tag, logo_url, captain_name, captain_contact, members,
            matches_played, wins, kills, placement_points, kill_points, bonus_points, total_points, rank
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
          ON CONFLICT (id) DO UPDATE SET
            team_name = EXCLUDED.team_name,
            tag = EXCLUDED.tag,
            matches_played = EXCLUDED.matches_played,
            wins = EXCLUDED.wins,
            kills = EXCLUDED.kills,
            placement_points = EXCLUDED.placement_points,
            kill_points = EXCLUDED.kill_points,
            bonus_points = EXCLUDED.bonus_points,
            total_points = EXCLUDED.total_points,
            rank = EXCLUDED.rank
        `;
        await pgPool.query(query, [
          Number(row.id), Number(row.tournament_id || 1), Number(row.slot || 1), row.team_name || '',
          row.tag || '', row.logo_url || '🎮', row.captain_name || '', row.captain_contact || '',
          JSON.stringify(Array.isArray(row.members) ? row.members : []),
          Number(row.matches_played || 0), Number(row.wins || 0), Number(row.kills || 0),
          Number(row.placement_points || 0), Number(row.kill_points || 0), Number(row.bonus_points || 0),
          Number(row.total_points || 0), Number(row.rank || 1)
        ]);
      } else if (table === 'esports_matches') {
        const query = `
          INSERT INTO esports_matches (
            id, tournament_id, match_title, match_number, map_name, played_at, mvp_player, results
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (id) DO UPDATE SET
            match_title = EXCLUDED.match_title,
            match_number = EXCLUDED.match_number,
            map_name = EXCLUDED.map_name,
            played_at = EXCLUDED.played_at,
            mvp_player = EXCLUDED.mvp_player,
            results = EXCLUDED.results
        `;
        await pgPool.query(query, [
          Number(row.id), Number(row.tournament_id || 1), row.match_title || '', Number(row.match_number || 1),
          row.map_name || '', row.played_at || '', row.mvp_player || '',
          JSON.stringify(Array.isArray(row.results) ? row.results : [])
        ]);
        console.log(`☁️ Synced esports match #${row.match_number} to Supabase / PostgreSQL`);
      } else if (table === 'esports_games') {
        const query = `
          INSERT INTO esports_games (
            id, name, slug, icon, banner_url, format, scoring_type, default_rules, description
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            slug = EXCLUDED.slug,
            default_rules = EXCLUDED.default_rules
        `;
        await pgPool.query(query, [
          Number(row.id), row.name || '', row.slug || '', row.icon || '', row.banner_url || '',
          row.format || '', row.scoring_type || '', JSON.stringify(row.default_rules || {}),
          row.description || ''
        ]);
      }
    } catch (err) {
      console.error(`Error syncing insert to PostgreSQL (${table}):`, err.message);
    }
  } else if (isSupabaseConnected && supabaseClient) {
    try {
      const { error } = await supabaseClient.from(table).insert([row]);
      if (error) console.error(`⚠️ Supabase API insert error for ${table}:`, error.message);
    } catch (e) {}
  }
}

/**
 * Updates a record in PostgreSQL / Supabase
 */
export async function syncPostgresUpdate(table, predicate, updateData) {
  if (!isPostgresActive() || !updateData) return;

  if (isPostgresConnected && pgPool) {
    try {
      if (table === 'events' && updateData.id) {
        await syncPostgresInsert('events', updateData);
      } else if (table === 'members' && updateData.id) {
        await syncPostgresInsert('members', updateData);
      } else if (table === 'esports_tournaments' && updateData.id) {
        await syncPostgresInsert('esports_tournaments', updateData);
      } else if (table === 'esports_teams' && updateData.id) {
        await syncPostgresInsert('esports_teams', updateData);
      } else if (table === 'esports_matches' && updateData.id) {
        await syncPostgresInsert('esports_matches', updateData);
      }
    } catch (err) {
      console.error(`Error syncing update to PostgreSQL (${table}):`, err.message);
    }
  }
}

/**
 * Deletes a record from PostgreSQL / Supabase
 */
export async function syncPostgresDelete(table, item) {
  if (!isPostgresActive() || !item) return;

  if (isPostgresConnected && pgPool && item.id) {
    try {
      await pgPool.query(`DELETE FROM ${table} WHERE id = $1`, [Number(item.id)]);
      console.log(`🗑️ Deleted record ID ${item.id} from Supabase / PostgreSQL [${table}]`);
    } catch (err) {
      console.error(`Error syncing delete to PostgreSQL (${table}):`, err.message);
    }
  }
}

/**
 * Batch replaces an entire collection in PostgreSQL / Supabase (e.g. events sync)
 */
export async function syncPostgresSetAll(table, list) {
  if (!isPostgresActive() || !Array.isArray(list)) return;

  if (isPostgresConnected && pgPool) {
    try {
      if (table === 'events') {
        const client = await pgPool.connect();
        try {
          await client.query('BEGIN');
          await client.query('DELETE FROM events');
          for (const ev of list) {
            const query = `
              INSERT INTO events (
                id, title, slug, category, event_date, event_time, venue, description, 
                poster_url, is_registration_open, max_seats, is_team_event, max_team_size, tags, feedback_questions, created_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            `;
            const values = [
              Number(ev.id),
              ev.title || '',
              ev.slug || '',
              ev.category || 'Workshop',
              ev.event_date || '',
              ev.event_time || '',
              ev.venue || '',
              ev.description || '',
              ev.poster_url || '',
              ev.is_registration_open ? 1 : 0,
              ev.max_seats || 100,
              ev.is_team_event ? 1 : 0,
              ev.max_team_size || 4,
              JSON.stringify(Array.isArray(ev.tags) ? ev.tags : []),
              JSON.stringify(Array.isArray(ev.feedbackQuestions) ? ev.feedbackQuestions : []),
              ev.created_at || new Date().toISOString()
            ];
            await client.query(query, values);
          }
          await client.query('COMMIT');
          console.log(`☁️ Batch synchronized ${list.length} events to Supabase / PostgreSQL.`);
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      }
    } catch (err) {
      console.error(`Error in syncPostgresSetAll (${table}):`, err.message);
    }
  }
}

/**
 * Sets a CMS setting in PostgreSQL / Supabase
 */
export async function syncPostgresSetSetting(key, value) {
  if (!isPostgresActive() || !key) return;

  if (isPostgresConnected && pgPool) {
    try {
      const query = `
        INSERT INTO site_content (key, value, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (key) DO UPDATE SET
          value = EXCLUDED.value,
          updated_at = NOW()
      `;
      await pgPool.query(query, [key, JSON.stringify(value)]);
      console.log(`☁️ Synced setting "${key}" to Supabase / PostgreSQL`);
    } catch (err) {
      console.error(`Error syncing setting "${key}" to PostgreSQL:`, err.message);
    }
  }
}
