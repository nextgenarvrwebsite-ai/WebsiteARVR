import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

const { Pool } = pg;

let pgPool = null;
let supabaseClient = null;
let isCloudDbActive = false;
let cloudType = 'none'; // 'postgres', 'supabase', or 'none'

export function initCloudDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

  // 1. Check for PostgreSQL Connection String (Supabase / Render Postgres / Neon / Railway)
  if (databaseUrl) {
    try {
      console.log('📡 Connecting to Cloud PostgreSQL database...');
      pgPool = new Pool({
        connectionString: databaseUrl,
        ssl: databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false }
      });

      // Test connection & setup schema
      pgPool.query('SELECT NOW()', (err, res) => {
        if (err) {
          console.error('⚠️ Cloud PostgreSQL connection notice:', err.message);
        } else {
          isCloudDbActive = true;
          cloudType = 'postgres';
          console.log('✅ Cloud PostgreSQL Connected successfully at:', res.rows[0].now);
          setupPostgresTables();
        }
      });
    } catch (err) {
      console.error('Error initializing PostgreSQL pool:', err);
    }
  } 
  // 2. Check for Supabase API Credentials
  else if (supabaseUrl && supabaseKey) {
    try {
      console.log('📡 Connecting to Supabase Cloud API...');
      supabaseClient = createClient(supabaseUrl, supabaseKey);
      isCloudDbActive = true;
      cloudType = 'supabase';
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

    CREATE TABLE IF NOT EXISTS contact_messages (
      id SERIAL PRIMARY KEY,
      name TEXT,
      email TEXT,
      subject TEXT,
      message TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `;

  try {
    await pgPool.query(schemaSql);
    console.log('✅ Cloud PostgreSQL tables verified: applications, event_registrations, feedback, contact_messages');
  } catch (err) {
    console.error('Error verifying PostgreSQL tables:', err.message);
  }
}

/**
 * Automatically syncs any inserted row into the active Cloud Database
 */
export async function syncToCloud(table, row) {
  // Fire optional Webhook notification if configured (Discord/Slack/Zapier/Make/Google Sheets)
  sendWebhookNotification(table, row);

  if (!isCloudDbActive) return;

  try {
    if (cloudType === 'postgres' && pgPool) {
      if (table === 'applications') {
        const query = `
          INSERT INTO applications (full_name, roll_no, branch, year, email, phone, domains, why_join, experience, portfolio_url, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `;
        const values = [
          row.full_name,
          row.roll_no,
          row.branch || '',
          row.year || '',
          row.email || '',
          row.phone || '',
          Array.isArray(row.domains) ? row.domains.join(', ') : (row.domains || ''),
          row.why_join || '',
          row.experience || '',
          row.portfolio_url || '',
          row.status || 'pending'
        ];
        await pgPool.query(query, values);
        console.log(`☁️ Synced new application for ${row.full_name} (${row.roll_no}) to Cloud PostgreSQL`);
      } else if (table === 'event_registrations') {
        const query = `
          INSERT INTO event_registrations (event_id, full_name, roll_no, email, phone, branch, year, is_team, team_name, team_members_info, ticket_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `;
        const values = [
          row.event_id,
          row.full_name,
          row.roll_no,
          row.email || '',
          row.phone || '',
          row.branch || '',
          row.year || '',
          Boolean(row.is_team),
          row.team_name || '',
          row.team_members_info || '',
          row.ticket_id || ''
        ];
        await pgPool.query(query, values);
        console.log(`☁️ Synced event registration for ${row.full_name} to Cloud PostgreSQL`);
      } else if (table === 'feedback') {
        const query = `
          INSERT INTO feedback (event_id, event_title, rating_content, rating_organization, rating_speaker, what_liked, what_improve, comments, author_name, author_email)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `;
        const values = [
          row.event_id || null,
          row.event_title || '',
          row.rating_content || 5,
          row.rating_organization || 5,
          row.rating_speaker || 5,
          row.what_liked || '',
          row.what_improve || '',
          row.comments || '',
          row.author_name || 'Anonymous',
          row.author_email || ''
        ];
        await pgPool.query(query, values);
        console.log(`☁️ Synced feedback to Cloud PostgreSQL`);
      } else if (table === 'contact_messages') {
        const query = `
          INSERT INTO contact_messages (name, email, subject, message)
          VALUES ($1, $2, $3, $4)
        `;
        const values = [row.name, row.email, row.subject, row.message];
        await pgPool.query(query, values);
        console.log(`☁️ Synced contact message from ${row.name} to Cloud PostgreSQL`);
      }
    } else if (cloudType === 'supabase' && supabaseClient) {
      const { error } = await supabaseClient.from(table).insert([row]);
      if (error) {
        console.error(`⚠️ Supabase sync error for ${table}:`, error.message);
      } else {
        console.log(`☁️ Synced record to Supabase table: ${table}`);
      }
    }
  } catch (err) {
    console.error(`Error syncing to cloud DB (${table}):`, err.message);
  }
}

/**
 * Optional: Instant webhook notifications (e.g. Discord, Slack, Zapier, Make, Telegram)
 */
function sendWebhookNotification(table, row) {
  const webhookUrl = process.env.NOTIFICATION_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  let title = 'NextGen AR/VR Portal Notification';
  let description = '';

  if (table === 'applications') {
    title = '🚀 New Club Application Received!';
    description = `**Name**: ${row.full_name}\n**Roll No**: ${row.roll_no}\n**Branch**: ${row.branch} (${row.year})\n**Email**: ${row.email}\n**Domains**: ${Array.isArray(row.domains) ? row.domains.join(', ') : row.domains}\n**Why Join**: ${row.why_join?.slice(0, 150)}...`;
  } else if (table === 'event_registrations') {
    title = '🎟️ New Event Registration Ticket!';
    description = `**Attendee**: ${row.full_name} (${row.roll_no})\n**Ticket ID**: ${row.ticket_id}\n**Mode**: ${row.is_team ? `Team (${row.team_name})` : 'Solo'}\n**Email**: ${row.email}`;
  } else if (table === 'feedback') {
    title = '⭐ New Event Feedback Submitted!';
    description = `**Event**: ${row.event_title}\n**Ratings**: Content: ${row.rating_content}★ | Org: ${row.rating_organization}★ | Speaker: ${row.rating_speaker}★\n**From**: ${row.author_name}`;
  } else if (table === 'contact_messages') {
    title = '📬 New Contact Message!';
    description = `**From**: ${row.name} (${row.email})\n**Subject**: ${row.subject}\n**Message**: ${row.message}`;
  } else {
    return;
  }

  fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: `🔔 **${title}**\n${description}`
    })
  }).catch(() => {});
}

export function getCloudStatus() {
  return {
    isCloudDbActive,
    cloudType
  };
}
