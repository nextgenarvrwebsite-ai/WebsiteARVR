// server/index.js
import "dotenv/config";
import express9 from "express";
import cors from "cors";
import path2 from "path";
import fs2 from "fs";
import { fileURLToPath as fileURLToPath2 } from "url";

// server/database.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";

// server/mongoDb.js
import mongoose from "mongoose";
var isMongoConnected = false;
var mongoConnectionUri = "";
var genericSchemaOptions = {
  strict: false,
  timestamps: true
};
var EventModel = mongoose.model("Event", new mongoose.Schema({
  id: { type: Number, index: true },
  title: String,
  slug: String,
  category: String,
  event_date: String,
  event_time: String,
  venue: String,
  description: String,
  poster_url: String,
  is_registration_open: mongoose.Schema.Types.Mixed,
  max_seats: Number,
  is_team_event: mongoose.Schema.Types.Mixed,
  max_team_size: Number,
  tags: [String],
  feedbackQuestions: [String],
  created_at: String
}, genericSchemaOptions), "events");
var RegistrationModel = mongoose.model("Registration", new mongoose.Schema({
  id: { type: Number, index: true },
  event_id: Number,
  full_name: String,
  roll_no: String,
  email: String,
  phone: String,
  branch: String,
  year: String,
  is_team: mongoose.Schema.Types.Mixed,
  team_name: String,
  team_members_info: String,
  ticket_id: String,
  status: String,
  registered_at: String
}, genericSchemaOptions), "event_registrations");
var FeedbackModel = mongoose.model("Feedback", new mongoose.Schema({
  id: { type: Number, index: true },
  event_id: Number,
  event_title: String,
  rating_content: Number,
  rating_organization: Number,
  rating_speaker: Number,
  what_liked: String,
  what_improve: String,
  comments: String,
  author_name: String,
  author_email: String,
  submitted_at: String
}, genericSchemaOptions), "feedback");
var MemberModel = mongoose.model("Member", new mongoose.Schema({
  id: { type: Number, index: true },
  full_name: String,
  branch: String,
  school: String,
  year: String,
  domain: String,
  role: String,
  email: String,
  phone: String,
  bio: String,
  avatar_url: String,
  status: String,
  is_faculty: Boolean,
  is_council: Boolean,
  badge: String
}, genericSchemaOptions), "members");
var ApplicationModel = mongoose.model("Application", new mongoose.Schema({
  id: { type: Number, index: true },
  full_name: String,
  roll_no: String,
  branch: String,
  year: String,
  email: String,
  phone: String,
  domains: mongoose.Schema.Types.Mixed,
  why_join: String,
  experience: String,
  portfolio_url: String,
  status: String,
  submitted_at: String
}, genericSchemaOptions), "applications");
var CmsModel = mongoose.model("SiteContent", new mongoose.Schema({
  key: { type: String, required: true, unique: true, index: true },
  value: mongoose.Schema.Types.Mixed
}, genericSchemaOptions), "site_content");
var AdminModel = mongoose.model("Admin", new mongoose.Schema({
  id: { type: Number, index: true },
  username: String,
  email: String,
  password_hash: String,
  role: String
}, genericSchemaOptions), "admins");
var AuditLogModel = mongoose.model("AuditLog", new mongoose.Schema({
  id: { type: Number, index: true },
  admin_user: String,
  action: String,
  details: mongoose.Schema.Types.Mixed,
  created_at: String
}, genericSchemaOptions), "audit_logs");
var EsportsModel = mongoose.model("EsportsGame", new mongoose.Schema({
  id: { type: Number, index: true },
  name: String,
  slug: String,
  icon: String,
  format: String,
  description: String
}, genericSchemaOptions), "esports_games");
var MODEL_MAP = {
  events: EventModel,
  event_registrations: RegistrationModel,
  feedback: FeedbackModel,
  members: MemberModel,
  applications: ApplicationModel,
  admins: AdminModel,
  audit_logs: AuditLogModel,
  esports_games: EsportsModel
};
async function initMongoDatabase(onConnectedCallback) {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith("mongodb") ? process.env.DATABASE_URL : null);
  if (!uri) {
    return false;
  }
  mongoConnectionUri = uri;
  try {
    const masked = uri.replace(/\/\/[^:]+:[^@]+@/, "//***:***@");
    console.log(`\u{1F4E1} Connecting to MongoDB Atlas (${masked})...`);
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 8e3,
      connectTimeoutMS: 1e4
    });
    isMongoConnected = true;
    console.log("\u2705 Cloud MongoDB Connected successfully to Render backend!");
    if (onConnectedCallback && typeof onConnectedCallback === "function") {
      await onConnectedCallback();
    }
    return true;
  } catch (err) {
    console.error("\u26A0\uFE0F MongoDB connection notice:", err.message);
    isMongoConnected = false;
    return false;
  }
}
function isMongoActive() {
  return isMongoConnected && mongoose.connection.readyState === 1;
}
function getMongoStatus() {
  return {
    isMongoConnected: isMongoActive(),
    readyState: mongoose.connection.readyState,
    host: mongoose.connection.host || null,
    dbName: mongoose.connection.name || null
  };
}
async function loadAllFromMongo(state2) {
  if (!isMongoActive()) return false;
  try {
    const promises = Object.keys(MODEL_MAP).map(async (table) => {
      const Model = MODEL_MAP[table];
      const records = await Model.find({}).lean();
      return { table, records };
    });
    const results = await Promise.all(promises);
    let totalLoaded = 0;
    for (const { table, records } of results) {
      if (Array.isArray(records) && records.length > 0) {
        state2[table] = records.map((r) => {
          const { _id, __v, ...clean } = r;
          return clean;
        });
        totalLoaded += records.length;
      }
    }
    const cmsRecords = await CmsModel.find({}).lean();
    if (cmsRecords && cmsRecords.length > 0) {
      if (!state2.site_content) state2.site_content = {};
      for (const item of cmsRecords) {
        state2.site_content[item.key] = item.value;
      }
    }
    console.log(`\u{1F4E5} Loaded ${totalLoaded} documents from MongoDB Atlas into active server state.`);
    return true;
  } catch (err) {
    console.error("Error loading from MongoDB:", err.message);
    return false;
  }
}
async function seedMongoIfEmpty(state2) {
  if (!isMongoActive()) return;
  try {
    for (const table of Object.keys(MODEL_MAP)) {
      const Model = MODEL_MAP[table];
      const count = await Model.countDocuments();
      if (count === 0 && Array.isArray(state2[table]) && state2[table].length > 0) {
        await Model.insertMany(state2[table]);
        console.log(`\u{1F331} Seeded ${state2[table].length} initial records into MongoDB [${table}]`);
      }
    }
    const cmsCount = await CmsModel.countDocuments();
    if (cmsCount === 0 && state2.site_content && Object.keys(state2.site_content).length > 0) {
      const docs = Object.entries(state2.site_content).map(([key, value]) => ({ key, value }));
      await CmsModel.insertMany(docs);
      console.log(`\u{1F331} Seeded ${docs.length} site_content settings into MongoDB`);
    }
  } catch (err) {
    console.error("Error seeding MongoDB:", err.message);
  }
}
async function syncMongoInsert(table, row) {
  if (!isMongoActive()) return;
  try {
    const Model = MODEL_MAP[table];
    if (Model) {
      await Model.create(row);
      console.log(`\u2601\uFE0F Synced new [${table}] record (ID: ${row.id}) to MongoDB Atlas`);
    }
  } catch (err) {
    console.error(`MongoDB insert error (${table}):`, err.message);
  }
}
async function syncMongoUpdate(table, predicate, updateData) {
  if (!isMongoActive()) return;
  try {
    const Model = MODEL_MAP[table];
    if (Model) {
      const query = updateData.id ? { id: updateData.id } : {};
      if (query.id) {
        await Model.updateOne(query, { $set: updateData }, { upsert: true });
        console.log(`\u2601\uFE0F Synced [${table}] update (ID: ${updateData.id}) to MongoDB Atlas`);
      }
    }
  } catch (err) {
    console.error(`MongoDB update error (${table}):`, err.message);
  }
}
async function syncMongoDelete(table, item) {
  if (!isMongoActive() || !item) return;
  try {
    const Model = MODEL_MAP[table];
    if (Model && item.id) {
      await Model.deleteOne({ id: item.id });
      console.log(`\u2601\uFE0F Synced [${table}] deletion (ID: ${item.id}) to MongoDB Atlas`);
    }
  } catch (err) {
    console.error(`MongoDB delete error (${table}):`, err.message);
  }
}
async function syncMongoSetAll(table, list) {
  if (!isMongoActive()) return;
  try {
    const Model = MODEL_MAP[table];
    if (Model && Array.isArray(list)) {
      await Model.deleteMany({});
      if (list.length > 0) {
        await Model.insertMany(list);
      }
      console.log(`\u2601\uFE0F Synced batch [${table}] (${list.length} items) to MongoDB Atlas`);
    }
  } catch (err) {
    console.error(`MongoDB setAll error (${table}):`, err.message);
  }
}
async function syncMongoSetSetting(key, value) {
  if (!isMongoActive()) return;
  try {
    await CmsModel.updateOne({ key }, { $set: { key, value } }, { upsert: true });
    console.log(`\u2601\uFE0F Synced site_content setting [${key}] to MongoDB Atlas`);
  } catch (err) {
    console.error(`MongoDB setting error (${key}):`, err.message);
  }
}

// server/postgresDb.js
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
var { Pool } = pg;
var pgPool = null;
var supabaseClient = null;
var isPostgresConnected = false;
var isSupabaseConnected = false;
var connectionType = "none";
var lastError = null;
function isPostgresActive() {
  return isPostgresConnected || isSupabaseConnected;
}
function getPostgresStatus() {
  return {
    isActive: isPostgresActive(),
    connectionType,
    isPostgresConnected,
    isSupabaseConnected,
    lastError: lastError ? lastError.message || String(lastError) : null
  };
}
async function initPostgresDatabase(onReadyCallback) {
  const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || process.env.POSTGRESQL_URI;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (connectionString && !connectionString.startsWith("mongodb")) {
    try {
      console.log("\u{1F4E1} Connecting to PostgreSQL Cloud Database (Supabase / Postgres)...");
      pgPool = new Pool({
        connectionString,
        ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
        connectionTimeoutMillis: 1e4
      });
      const testRes = await pgPool.query("SELECT NOW()");
      isPostgresConnected = true;
      connectionType = "postgres";
      console.log("\u2705 Cloud PostgreSQL Connected successfully! Server time:", testRes.rows[0].now);
      await verifyAndCreateTables();
      if (onReadyCallback) {
        await onReadyCallback();
      }
      return true;
    } catch (err) {
      lastError = err;
      console.error("\u274C Failed to connect to Cloud PostgreSQL:", err.message);
    }
  }
  if (supabaseUrl && supabaseKey) {
    try {
      console.log("\u{1F4E1} Initializing Supabase REST API Client for:", supabaseUrl);
      supabaseClient = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false }
      });
      isSupabaseConnected = true;
      connectionType = "supabase_api";
      console.log("\u2705 Supabase REST API Client connected successfully!");
      if (onReadyCallback) {
        await onReadyCallback();
      }
      return true;
    } catch (err) {
      lastError = err;
      console.error("\u274C Failed to initialize Supabase Client:", err.message);
    }
  }
  return false;
}
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
      branch TEXT,
      year TEXT,
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
  `;
  try {
    await pgPool.query(ddl);
    console.log("\u2705 PostgreSQL / Supabase tables verified: events, members, registrations, feedback, applications, site_content, admins");
  } catch (err) {
    console.error("Error verifying PostgreSQL tables:", err.message);
  }
}
async function loadAllFromPostgres(state2) {
  if (isPostgresConnected && pgPool) {
    try {
      let totalLoaded = 0;
      const eventsRes = await pgPool.query("SELECT * FROM events ORDER BY id ASC");
      if (eventsRes.rows && eventsRes.rows.length > 0) {
        state2.events = eventsRes.rows.map((r) => ({
          ...r,
          id: Number(r.id),
          tags: Array.isArray(r.tags) ? r.tags : [],
          feedbackQuestions: Array.isArray(r.feedback_questions) ? r.feedback_questions : []
        }));
        totalLoaded += eventsRes.rows.length;
      }
      const membersRes = await pgPool.query("SELECT * FROM members ORDER BY id ASC");
      if (membersRes.rows && membersRes.rows.length > 0) {
        state2.members = membersRes.rows.map((r) => ({ ...r, id: Number(r.id) }));
        totalLoaded += membersRes.rows.length;
      }
      const regsRes = await pgPool.query("SELECT * FROM event_registrations ORDER BY id ASC");
      if (regsRes.rows && regsRes.rows.length > 0) {
        state2.event_registrations = regsRes.rows.map((r) => ({ ...r, id: Number(r.id), event_id: Number(r.event_id) }));
        totalLoaded += regsRes.rows.length;
      }
      const fbRes = await pgPool.query("SELECT * FROM feedback ORDER BY id ASC");
      if (fbRes.rows && fbRes.rows.length > 0) {
        state2.feedback = fbRes.rows.map((r) => ({ ...r, id: Number(r.id), event_id: Number(r.event_id) }));
        totalLoaded += fbRes.rows.length;
      }
      const appsRes = await pgPool.query("SELECT * FROM applications ORDER BY id ASC");
      if (appsRes.rows && appsRes.rows.length > 0) {
        state2.applications = appsRes.rows.map((r) => ({
          ...r,
          id: Number(r.id),
          domains: Array.isArray(r.domains) ? r.domains : []
        }));
        totalLoaded += appsRes.rows.length;
      }
      const cmsRes = await pgPool.query("SELECT key, value FROM site_content");
      if (cmsRes.rows && cmsRes.rows.length > 0) {
        if (!state2.site_content) state2.site_content = {};
        for (const row of cmsRes.rows) {
          state2.site_content[row.key] = row.value;
        }
      }
      console.log(`\u{1F4E5} Loaded ${totalLoaded} records from Supabase / PostgreSQL into active server state.`);
      return true;
    } catch (err) {
      console.error("Error loading data from PostgreSQL:", err.message);
      return false;
    }
  }
  if (isSupabaseConnected && supabaseClient) {
    try {
      const { data: eventsData } = await supabaseClient.from("events").select("*");
      if (Array.isArray(eventsData) && eventsData.length > 0) {
        state2.events = eventsData.map((e) => ({ ...e, id: Number(e.id) }));
      }
      return true;
    } catch (err) {
      console.warn("Notice loading from Supabase API client:", err.message);
    }
  }
  return false;
}
async function seedPostgresIfEmpty(state2) {
  if (isPostgresConnected && pgPool) {
    try {
      const eventsCheck = await pgPool.query("SELECT COUNT(*) FROM events");
      const eventCount = parseInt(eventsCheck.rows[0].count, 10);
      if (eventCount === 0 && Array.isArray(state2.events) && state2.events.length > 0) {
        for (const ev of state2.events) {
          await syncPostgresInsert("events", ev);
        }
        console.log(`\u{1F331} Seeded ${state2.events.length} initial events into Supabase / PostgreSQL.`);
      }
      const membersCheck = await pgPool.query("SELECT COUNT(*) FROM members");
      const memberCount = parseInt(membersCheck.rows[0].count, 10);
      if (memberCount === 0 && Array.isArray(state2.members) && state2.members.length > 0) {
        for (const m of state2.members) {
          await syncPostgresInsert("members", m);
        }
        console.log(`\u{1F331} Seeded ${state2.members.length} initial members into Supabase / PostgreSQL.`);
      }
      const cmsCheck = await pgPool.query("SELECT COUNT(*) FROM site_content");
      const cmsCount = parseInt(cmsCheck.rows[0].count, 10);
      if (cmsCount === 0 && state2.site_content && Object.keys(state2.site_content).length > 0) {
        for (const [key, value] of Object.entries(state2.site_content)) {
          await syncPostgresSetSetting(key, value);
        }
        console.log(`\u{1F331} Seeded initial site_content settings into Supabase / PostgreSQL.`);
      }
    } catch (err) {
      console.error("Error seeding PostgreSQL:", err.message);
    }
  }
}
async function syncPostgresInsert(table, row) {
  if (!isPostgresActive() || !row) return;
  if (isPostgresConnected && pgPool) {
    try {
      if (table === "events") {
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
          row.title || "",
          row.slug || "",
          row.category || "Workshop",
          row.event_date || "",
          row.event_time || "",
          row.venue || "",
          row.description || "",
          row.poster_url || "",
          row.is_registration_open ? 1 : 0,
          row.max_seats || 100,
          row.is_team_event ? 1 : 0,
          row.max_team_size || 4,
          JSON.stringify(Array.isArray(row.tags) ? row.tags : []),
          JSON.stringify(Array.isArray(row.feedbackQuestions) ? row.feedbackQuestions : []),
          row.created_at || (/* @__PURE__ */ new Date()).toISOString()
        ];
        await pgPool.query(query, values);
        console.log(`\u2601\uFE0F Synced event "${row.title}" (ID: ${row.id}) to Supabase / PostgreSQL`);
      } else if (table === "members") {
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
          row.full_name || "",
          row.roll_no || "",
          row.branch || "",
          row.school || "",
          row.year || "",
          row.domain || "",
          row.role || "",
          row.designation || "",
          row.email || "",
          row.phone || "",
          row.bio || "",
          row.avatar_url || "",
          row.github_url || "",
          row.linkedin_url || "",
          row.portfolio_url || "",
          row.status || "active",
          Boolean(row.is_faculty),
          Boolean(row.is_council),
          row.badge || "",
          row.joined_at || ""
        ];
        await pgPool.query(query, values);
        console.log(`\u2601\uFE0F Synced member "${row.full_name}" to Supabase / PostgreSQL`);
      } else if (table === "event_registrations") {
        const query = `
          INSERT INTO event_registrations (
            event_id, full_name, roll_no, email, phone, branch, year, is_team, team_name, team_members_info, ticket_id, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `;
        const values = [
          Number(row.event_id),
          row.full_name || "",
          row.roll_no || "",
          row.email || "",
          row.phone || "",
          row.branch || "",
          row.year || "",
          Boolean(row.is_team),
          row.team_name || "",
          row.team_members_info || "",
          row.ticket_id || "",
          row.status || "confirmed"
        ];
        await pgPool.query(query, values);
        console.log(`\u2601\uFE0F Synced registration for ${row.full_name} to Supabase / PostgreSQL`);
      } else if (table === "feedback") {
        const query = `
          INSERT INTO feedback (
            event_id, event_title, participant_name, register_no, email, department,
            rating_content, rating_organization, rating_speaker, what_liked, what_improve, comments, answers
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `;
        const values = [
          row.event_id ? Number(row.event_id) : null,
          row.event_title || "",
          row.participant_name || "",
          row.register_no || "",
          row.email || "",
          row.department || "",
          row.rating_content || 5,
          row.rating_organization || 5,
          row.rating_speaker || 5,
          row.what_liked || "",
          row.what_improve || "",
          row.comments || "",
          JSON.stringify(row.answers || {})
        ];
        await pgPool.query(query, values);
        console.log(`\u2601\uFE0F Synced feedback for event "${row.event_title}" to Supabase / PostgreSQL`);
      } else if (table === "applications") {
        const query = `
          INSERT INTO applications (
            full_name, roll_no, branch, year, email, phone, domains, why_join, experience, portfolio_url, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `;
        const values = [
          row.full_name || "",
          row.roll_no || "",
          row.branch || "",
          row.year || "",
          row.email || "",
          row.phone || "",
          JSON.stringify(Array.isArray(row.domains) ? row.domains : []),
          row.why_join || "",
          row.experience || "",
          row.portfolio_url || "",
          row.status || "pending"
        ];
        await pgPool.query(query, values);
        console.log(`\u2601\uFE0F Synced application for ${row.full_name} to Supabase / PostgreSQL`);
      }
    } catch (err) {
      console.error(`Error syncing insert to PostgreSQL (${table}):`, err.message);
    }
  } else if (isSupabaseConnected && supabaseClient) {
    try {
      const { error } = await supabaseClient.from(table).insert([row]);
      if (error) console.error(`\u26A0\uFE0F Supabase API insert error for ${table}:`, error.message);
    } catch (e) {
    }
  }
}
async function syncPostgresUpdate(table, predicate, updateData) {
  if (!isPostgresActive() || !updateData) return;
  if (isPostgresConnected && pgPool) {
    try {
      if (table === "events" && updateData.id) {
        await syncPostgresInsert("events", updateData);
      } else if (table === "members" && updateData.id) {
        await syncPostgresInsert("members", updateData);
      }
    } catch (err) {
      console.error(`Error syncing update to PostgreSQL (${table}):`, err.message);
    }
  }
}
async function syncPostgresDelete(table, item) {
  if (!isPostgresActive() || !item) return;
  if (isPostgresConnected && pgPool && item.id) {
    try {
      await pgPool.query(`DELETE FROM ${table} WHERE id = $1`, [Number(item.id)]);
      console.log(`\u{1F5D1}\uFE0F Deleted record ID ${item.id} from Supabase / PostgreSQL [${table}]`);
    } catch (err) {
      console.error(`Error syncing delete to PostgreSQL (${table}):`, err.message);
    }
  }
}
async function syncPostgresSetAll(table, list) {
  if (!isPostgresActive() || !Array.isArray(list)) return;
  if (isPostgresConnected && pgPool) {
    try {
      if (table === "events") {
        const client = await pgPool.connect();
        try {
          await client.query("BEGIN");
          await client.query("DELETE FROM events");
          for (const ev of list) {
            const query = `
              INSERT INTO events (
                id, title, slug, category, event_date, event_time, venue, description, 
                poster_url, is_registration_open, max_seats, is_team_event, max_team_size, tags, feedback_questions, created_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            `;
            const values = [
              Number(ev.id),
              ev.title || "",
              ev.slug || "",
              ev.category || "Workshop",
              ev.event_date || "",
              ev.event_time || "",
              ev.venue || "",
              ev.description || "",
              ev.poster_url || "",
              ev.is_registration_open ? 1 : 0,
              ev.max_seats || 100,
              ev.is_team_event ? 1 : 0,
              ev.max_team_size || 4,
              JSON.stringify(Array.isArray(ev.tags) ? ev.tags : []),
              JSON.stringify(Array.isArray(ev.feedbackQuestions) ? ev.feedbackQuestions : []),
              ev.created_at || (/* @__PURE__ */ new Date()).toISOString()
            ];
            await client.query(query, values);
          }
          await client.query("COMMIT");
          console.log(`\u2601\uFE0F Batch synchronized ${list.length} events to Supabase / PostgreSQL.`);
        } catch (err) {
          await client.query("ROLLBACK");
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
async function syncPostgresSetSetting(key, value) {
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
      console.log(`\u2601\uFE0F Synced setting "${key}" to Supabase / PostgreSQL`);
    } catch (err) {
      console.error(`Error syncing setting "${key}" to PostgreSQL:`, err.message);
    }
  }
}

// server/cloudDb.js
var activeCloudType = "none";
async function initCloudDatabase(onCloudReady) {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (mongoUri) {
    const mongoOk = await initMongoDatabase(onCloudReady);
    if (mongoOk) {
      activeCloudType = "mongodb";
      return true;
    }
  }
  const postgresOk = await initPostgresDatabase(onCloudReady);
  if (postgresOk) {
    activeCloudType = "postgres";
    return true;
  }
  console.log("\u{1F4BE} Cloud Database variables not detected. Operating with local database persistence (database.json).");
  return false;
}
async function loadAllFromCloud(state2) {
  if (isMongoActive()) {
    return await loadAllFromMongo(state2);
  }
  if (isPostgresActive()) {
    return await loadAllFromPostgres(state2);
  }
  return false;
}
async function seedCloudIfEmpty(state2) {
  if (isMongoActive()) {
    await seedMongoIfEmpty(state2);
  } else if (isPostgresActive()) {
    await seedPostgresIfEmpty(state2);
  }
}
async function syncToCloud(table, row) {
  sendWebhookNotification(table, row);
  if (isMongoActive()) {
    await syncMongoInsert(table, row);
  } else if (isPostgresActive()) {
    await syncPostgresInsert(table, row);
  }
}
async function syncUpdateToCloud(table, predicate, updateData) {
  if (isMongoActive()) {
    await syncMongoUpdate(table, predicate, updateData);
  } else if (isPostgresActive()) {
    await syncPostgresUpdate(table, predicate, updateData);
  }
}
async function syncDeleteToCloud(table, item) {
  if (isMongoActive()) {
    await syncMongoDelete(table, item);
  } else if (isPostgresActive()) {
    await syncPostgresDelete(table, item);
  }
}
async function syncSetAllToCloud(table, list) {
  if (isMongoActive()) {
    await syncMongoSetAll(table, list);
  } else if (isPostgresActive()) {
    await syncPostgresSetAll(table, list);
  }
}
async function syncSettingToCloud(key, value) {
  if (isMongoActive()) {
    await syncMongoSetSetting(key, value);
  } else if (isPostgresActive()) {
    await syncPostgresSetSetting(key, value);
  }
}
function sendWebhookNotification(table, row) {
  const webhookUrl = process.env.NOTIFICATION_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;
  let title = "NextGen AR/VR Portal Notification";
  let description = "";
  if (table === "applications") {
    title = "\u{1F680} New Club Application Received!";
    description = `**Name**: ${row.full_name}
**Roll No**: ${row.roll_no}
**Branch**: ${row.branch} (${row.year})
**Email**: ${row.email}
**Domains**: ${Array.isArray(row.domains) ? row.domains.join(", ") : row.domains}
**Why Join**: ${row.why_join?.slice(0, 150)}...`;
  } else if (table === "event_registrations") {
    title = "\u{1F39F}\uFE0F New Event Registration Ticket!";
    description = `**Attendee**: ${row.full_name} (${row.roll_no})
**Ticket ID**: ${row.ticket_id}
**Mode**: ${row.is_team ? `Team (${row.team_name})` : "Solo"}
**Email**: ${row.email}`;
  } else if (table === "feedback") {
    title = "\u2B50 New Event Feedback Submitted!";
    description = `**Event**: ${row.event_title}
**Ratings**: Content: ${row.rating_content}\u2605 | Org: ${row.rating_organization}\u2605 | Speaker: ${row.rating_speaker}\u2605
**From**: ${row.author_name}`;
  } else if (table === "contact_messages") {
    title = "\u{1F4EC} New Contact Message!";
    description = `**From**: ${row.name} (${row.email})
**Subject**: ${row.subject}
**Message**: ${row.message}`;
  } else {
    return;
  }
  fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: `\u{1F514} **${title}**
${description}`
    })
  }).catch(() => {
  });
}
function getCloudStatus() {
  const isCloudActive = isMongoActive() || isPostgresActive();
  let type = "none";
  if (isMongoActive()) type = "mongodb";
  else if (isPostgresActive()) type = "supabase_postgres";
  return {
    isCloudDbActive: isCloudActive,
    cloudType: type,
    mongodb: getMongoStatus(),
    postgres: getPostgresStatus()
  };
}

// server/database.js
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var dataDir = path.join(__dirname, "data");
var dbFile = path.join(dataDir, "database.json");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
var state = {
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
    fs.writeFileSync(dbFile, JSON.stringify(state, null, 2), "utf-8");
  } catch (err) {
    console.error("Error writing to database.json:", err);
  }
}
function loadFromDisk() {
  if (fs.existsSync(dbFile)) {
    try {
      const data = fs.readFileSync(dbFile, "utf-8");
      if (data && data.trim()) {
        state = JSON.parse(data);
      }
    } catch (err) {
      console.error("Error reading database.json:", err);
    }
  }
}
var db = {
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
    const id = state[table].length > 0 ? Math.max(...state[table].map((r) => r.id || 0)) + 1 : 1;
    const newRecord = {
      id,
      ...row,
      created_at: row.created_at || (/* @__PURE__ */ new Date()).toISOString()
    };
    state[table].push(newRecord);
    saveToDisk();
    syncToCloud(table, newRecord);
    return newRecord;
  },
  update(table, predicate, updateData) {
    if (!state[table]) return null;
    const index = state[table].findIndex(predicate);
    if (index === -1) return null;
    state[table][index] = {
      ...state[table][index],
      ...updateData,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    saveToDisk();
    syncUpdateToCloud(table, predicate, state[table][index]);
    return state[table][index];
  },
  delete(table, predicate) {
    if (!state[table]) return false;
    const initialLen = state[table].length;
    const toDelete = state[table].filter(predicate);
    state[table] = state[table].filter((item) => !predicate(item));
    const deleted = state[table].length < initialLen;
    if (deleted) {
      saveToDisk();
      for (const item of toDelete) {
        syncDeleteToCloud(table, item);
      }
    }
    return deleted;
  },
  count(table, predicate = () => true) {
    if (!state[table]) return 0;
    return state[table].filter(predicate).length;
  },
  getSetting(key, defaultValue = null) {
    return state.site_content && state.site_content[key] !== void 0 ? state.site_content[key] : defaultValue;
  },
  setSetting(key, value) {
    if (!state.site_content) state.site_content = {};
    state.site_content[key] = value;
    saveToDisk();
    syncSettingToCloud(key, value);
    return value;
  },
  setAll(table, list) {
    state[table] = Array.isArray(list) ? list : [];
    saveToDisk();
    syncSetAllToCloud(table, state[table]);
    return state[table];
  }
};
async function initDatabase() {
  loadFromDisk();
  await initCloudDatabase(async () => {
    await loadAllFromCloud(state);
    await seedCloudIfEmpty(state);
    saveToDisk();
  });
  if (!state.admins || state.admins.length === 0) {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync("Admin@NextGen2026!", salt);
    state.admins = [
      {
        id: 1,
        username: "admin",
        email: "admin@nextgenarvr.club",
        password_hash: hash,
        role: "super_admin",
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        last_login: null
      }
    ];
    console.log("\u2705 Default Admin seeded: admin@nextgenarvr.club / Admin@NextGen2026!");
  }
  if (!state.site_content || Object.keys(state.site_content).length === 0) {
    state.site_content = {
      recruitment_status: {
        is_open: true,
        batch_name: "Fall 2026 Cohort",
        deadline: "2026-09-15",
        banner_message: "\u{1F680} Fall 2026 Recruitment is LIVE! Applications are open across all technical & creative domains."
      },
      announcement_banner: {
        active: true,
        title: "Meta XR Hackathon 2026 Registrations Open!",
        link: "/events",
        badge: "FEATURED"
      },
      club_stats: {
        members_count: "250+",
        projects_count: "24+",
        events_hosted: "50+",
        esports_pool_won: "$15,000+"
      },
      contact_info: {
        email: "contact@nextgenarvr.club",
        lab_location: "Spatial Computing Lab, Room 402, Technology Block A",
        discord: "https://discord.gg/nextgen-arvr",
        instagram: "https://instagram.com/nextgen_arvr",
        linkedin: "https://linkedin.com/company/nextgen-arvr-club",
        github: "https://github.com/nextgen-arvr-club"
      }
    };
  }
  if (!state.members || state.members.length === 0) {
    state.members = [
      {
        id: 1,
        full_name: "Prof. Ananthanagu U",
        roll_no: "",
        branch: "Information Technology",
        school: "Information Technology",
        year: "Faculty",
        domain: "AR/VR & Immersive Technologies",
        role: "Faculty Coordinator & Mentor",
        designation: "Assistant Professor & Associate Director (In Charge) - Centre of Excellence (Immersive Technologies (AR/VR))",
        email: "ananthanagu.u@alliance.edu.in",
        phone: "+91 98450 12345",
        bio: "Assistant Professor & Associate Director (In Charge) - Centre of Excellence (Immersive Technologies (AR/VR)) at Alliance University. 14+ years of academic experience with research expertise in Data Science, Machine Learning, NLP, and Virtual Reality visualizations (IEEE ICVR 2023). Life member of CSI and ISTE.",
        avatar_url: "https://www.alliance.edu.in/wp-content/uploads/faculty/core-faculty/mr-ananthanagu-u-v1.webp",
        github_url: "",
        linkedin_url: "",
        portfolio_url: "https://www.alliance.edu.in/faculty/prof-ananthanagu-u/",
        status: "core_team",
        is_faculty: true,
        joined_at: "2022-06-01"
      },
      {
        id: 2,
        full_name: "Ms. Kusuma J",
        roll_no: "",
        branch: "Information Technology",
        school: "Information Technology",
        year: "Faculty",
        domain: "AI & Deep Learning",
        role: "Faculty Coordinator & Mentor",
        designation: "Assistant Professor, Department of Computer Science & Engineering",
        email: "kusuma.j@alliance.edu.in",
        phone: "+91 98450 67890",
        bio: "Assistant Professor in Computer Science & Engineering at Alliance University. 5+ years of teaching experience with research specialization in Image Processing, Data Analytics, Machine Learning, and Deep Learning. Published in IEEE & Springer. Life member of ISTE.",
        avatar_url: "https://www.alliance.edu.in/wp-content/uploads/faculty/core-faculty/ms-kusuma-j.webp",
        github_url: "",
        linkedin_url: "",
        portfolio_url: "https://www.alliance.edu.in/faculty/ms-kusuma-j/",
        status: "core_team",
        is_faculty: true,
        joined_at: "2023-01-10"
      },
      {
        id: 3,
        full_name: "S Darshan Sai",
        roll_no: "",
        branch: "Information Technology",
        school: "Information Technology",
        year: "3rd Year",
        domain: "AR/VR & Spatial Innovation",
        role: "President",
        email: "president.nextgen@alliance.edu.in",
        phone: "",
        bio: "President of NextGen (AR/VR) Reality Club (3rd Year, Information Technology). Leading spatial innovation, hardware initiatives, and immersive metaverse development at Alliance University.",
        avatar_url: "/assets/council/council_member_1.jpg",
        github_url: "",
        linkedin_url: "",
        portfolio_url: "",
        status: "core_team",
        is_council: true,
        badge: "PRESIDENT",
        joined_at: "2023-08-01"
      },
      {
        id: 4,
        full_name: "Apoorva P Keretot",
        roll_no: "",
        branch: "Information Technology",
        school: "Information Technology",
        year: "3rd Year",
        domain: "Executive Council & Technical Wings",
        role: "Vice President",
        email: "vp.nextgen@alliance.edu.in",
        phone: "",
        bio: "Vice President of NextGen (AR/VR) Reality Club (3rd Year, Information Technology). Overseeing executive operations, technical domain workshops, and student community engagements.",
        avatar_url: "/assets/council/council_member_4.jpg",
        github_url: "",
        linkedin_url: "",
        portfolio_url: "",
        status: "core_team",
        is_council: true,
        badge: "VICE PRESIDENT",
        joined_at: "2023-08-15"
      },
      {
        id: 5,
        full_name: "Rashmi",
        roll_no: "",
        branch: "Information Technology",
        school: "Information Technology",
        year: "3rd Year",
        domain: "Administration & Governance",
        role: "Secretary",
        email: "secretary.nextgen@alliance.edu.in",
        phone: "",
        bio: "Secretary of NextGen (AR/VR) Reality Club (3rd Year, Information Technology). Managing administrative governance, official council records, institutional communications, and student delegations.",
        avatar_url: "/assets/council/council_member_rashmi.jpg",
        github_url: "",
        linkedin_url: "",
        portfolio_url: "",
        status: "core_team",
        is_council: true,
        badge: "SECRETARY",
        joined_at: "2023-08-20"
      },
      {
        id: 6,
        full_name: "Sudeep",
        roll_no: "",
        branch: "Information Technology",
        school: "Information Technology",
        year: "3rd Year",
        domain: "Operations & Member Relations",
        role: "Joint Secretary",
        email: "jointsecretary.nextgen@alliance.edu.in",
        phone: "",
        bio: "Joint Secretary of NextGen (AR/VR) Reality Club (3rd Year, Information Technology). Coordinating event operations, inter-domain logistics, club administration, and student outreach.",
        avatar_url: "/assets/council/council_member_sudeep.jpg",
        github_url: "",
        linkedin_url: "",
        portfolio_url: "",
        status: "core_team",
        is_council: true,
        badge: "JOINT SECRETARY",
        joined_at: "2023-08-25"
      },
      {
        id: 7,
        full_name: "Puneeth N",
        roll_no: "",
        branch: "Information Technology",
        school: "Information Technology",
        year: "3rd Year",
        domain: "Treasury & Resource Operations",
        role: "Treasurer",
        email: "treasurer.nextgen@alliance.edu.in",
        phone: "",
        bio: "Council Member & Treasurer of NextGen (AR/VR) Reality Club (3rd Year, Information Technology). Managing club budget allocations, sponsorships, financial operations, and resources.",
        avatar_url: "/assets/council/council_member_3.jpg",
        github_url: "",
        linkedin_url: "",
        portfolio_url: "",
        status: "core_team",
        is_council: true,
        badge: "TREASURER",
        joined_at: "2023-09-01"
      },
      {
        id: 8,
        full_name: "Koel Dutta",
        roll_no: "",
        branch: "Information Technology",
        school: "Information Technology",
        year: "3rd Year",
        domain: "Student Operations & Community Lead",
        role: "Executive Member",
        email: "executive.nextgen@alliance.edu.in",
        phone: "",
        bio: "Council Member & Executive Member Lead (3rd Year, Information Technology). Directing student delegations, domain wings engagement, and internal club initiatives.",
        avatar_url: "/assets/council/council_member_5.jpg",
        github_url: "",
        linkedin_url: "",
        portfolio_url: "",
        status: "core_team",
        is_council: true,
        badge: "EXECUTIVE MEMBER",
        joined_at: "2024-01-15"
      },
      {
        id: 9,
        full_name: "Panchaksharayya",
        roll_no: "",
        branch: "Information Technology",
        school: "Information Technology",
        year: "3rd Year",
        domain: "Media, PR & Documentation",
        role: "Media and Documentation Coordinator",
        email: "media.nextgen@alliance.edu.in",
        phone: "",
        bio: "Council Member & Media and Documentation Coordinator (3rd Year, Information Technology). Managing documentation, institutional reporting, media production, and digital archives.",
        avatar_url: "/assets/council/council_member_2.jpg",
        github_url: "",
        linkedin_url: "",
        portfolio_url: "",
        status: "core_team",
        is_council: true,
        badge: "MEDIA & DOCUMENTATION",
        joined_at: "2023-09-10"
      }
    ];
  }
  if (!state.events) {
    state.events = [];
  }
  if (!state.event_registrations) {
    state.event_registrations = [];
  }
  if (!state.applications || state.applications.length === 0) {
    state.applications = [
      {
        id: 1,
        full_name: "Ishaan Verma",
        roll_no: "25CS034",
        branch: "Computer Science",
        year: "1st Year",
        email: "ishaan.v@college.edu",
        phone: "+91 98711 33445",
        domains: ["AR/VR & Spatial Computing", "Game Development"],
        why_join: "I have been experimenting with Unity VR development and want to collaborate with seniors on WebXR hackathons.",
        experience: "Built a 3D solar system simulator in Unity and know basic C# scripting.",
        portfolio_url: "https://github.com/ishaan-v-dev",
        status: "pending",
        review_notes: "",
        submitted_at: "2026-08-20 11:45"
      },
      {
        id: 2,
        full_name: "Sneha Roy",
        roll_no: "24ECE019",
        branch: "Electronics & Comm.",
        year: "2nd Year",
        email: "sneha.roy@college.edu",
        phone: "+91 98722 44556",
        domains: ["3D Design & Worldbuilding"],
        why_join: "I create 3D environment assets in Blender and want to design immersive VR spaces for club projects.",
        experience: "2 years of Blender modeling, texturing with Substance Painter, and basic rigging.",
        portfolio_url: "https://artstation.com/sneharoy3d",
        status: "pending",
        review_notes: "",
        submitted_at: "2026-08-21 16:20"
      }
    ];
  }
  if (!state.feedback) {
    state.feedback = [];
  }
  if (!state.esports_games || state.esports_games.length === 0) {
    state.esports_games = [
      {
        id: 1,
        name: "Valorant",
        slug: "valorant",
        icon: "Crosshair",
        banner_url: "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&q=80&w=800",
        format: "5v5 Tactical Shooter",
        scoring_type: "match_win",
        default_rules: {
          match_win_points: 3,
          match_draw_points: 1,
          round_diff_multiplier: 0.1,
          ace_bonus: 1
        },
        description: "First-person tactical hero shooter with precision gunplay and unique agent abilities."
      },
      {
        id: 2,
        name: "BGMI / Battle Royale League",
        slug: "bgmi-battle-royale",
        icon: "Target",
        banner_url: "https://images.unsplash.com/photo-1538481199705-c710c4e965fc?auto=format&fit=crop&q=80&w=800",
        format: "Squad Battle Royale (16 Teams)",
        scoring_type: "battle_royale",
        default_rules: {
          placement_points: {
            "1": 15,
            "2": 12,
            "3": 10,
            "4": 8,
            "5": 6,
            "6": 4,
            "7": 2,
            "8": 1,
            "9": 1,
            "10": 1,
            "11": 0,
            "12": 0,
            "13": 0,
            "14": 0,
            "15": 0,
            "16": 0
          },
          kill_point_multiplier: 1,
          winner_chicken_dinner_bonus: 5
        },
        description: "High-stakes battle royale combat where strategic zone rotations and gunfights determine the champions."
      },
      {
        id: 3,
        name: "Rocket League 3v3",
        slug: "rocket-league",
        icon: "Zap",
        banner_url: "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&q=80&w=800",
        format: "3v3 High-Octane Vehicular Soccer",
        scoring_type: "match_win",
        default_rules: {
          series_win_points: 3,
          goal_diff_multiplier: 0.2,
          hat_trick_bonus: 1
        },
        description: "Vehicular acrobatics meets soccer in hyper-fast airborne action."
      }
    ];
    state.esports_tournaments = [
      {
        id: 1,
        title: "NextGen Pro Apex League Season 4",
        slug: "nextgen-pro-apex-season-4",
        game_id: 2,
        game_name: "BGMI / Battle Royale League",
        prize_pool: "\u20B950,000 INR (~$600 USD)",
        status: "live",
        start_date: "2026-08-15",
        end_date: "2026-09-10",
        venue: "NextGen Esports Lab & Twitch",
        banner_url: "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&q=80&w=800",
        registration_open: 1,
        scoring_rules: {
          placement_scale: {
            "1": 15,
            "2": 12,
            "3": 10,
            "4": 8,
            "5": 6,
            "6": 4,
            "7": 2,
            "8": 1,
            "9": 1,
            "10": 1
          },
          kill_multiplier: 1,
          win_bonus: 5
        },
        description: "The premier college Battle Royale championship featuring 16 top squads battling across 6 rigorous map rotations."
      }
    ];
    state.esports_teams = [
      {
        id: 1,
        tournament_id: 1,
        team_name: "Vortex Phantom",
        tag: "VP",
        logo_url: "\u26A1",
        captain_name: 'Samar "Vortex" Singh',
        captain_contact: "samar.vp@gmail.com",
        members: ["Vortex", "Krypton", "ShadowStrike", "Nova"],
        matches_played: 5,
        wins: 2,
        kills: 42,
        placement_points: 58,
        kill_points: 42,
        bonus_points: 10,
        total_points: 110,
        rank: 1
      },
      {
        id: 2,
        tournament_id: 1,
        team_name: "Cyber Valkyries",
        tag: "CVK",
        logo_url: "\u{1F985}",
        captain_name: 'Rhea "Valkyrie" Sen',
        captain_contact: "rhea.cvk@gmail.com",
        members: ["Valkyrie", "PixelQueen", "Athena", "Siren"],
        matches_played: 5,
        wins: 1,
        kills: 38,
        placement_points: 52,
        kill_points: 38,
        bonus_points: 5,
        total_points: 95,
        rank: 2
      },
      {
        id: 3,
        tournament_id: 1,
        team_name: "HyperDrive Gaming",
        tag: "HDG",
        logo_url: "\u{1F525}",
        captain_name: 'Aditya "Pulse" Rao',
        captain_contact: "aditya.hdg@gmail.com",
        members: ["Pulse", "Blaze", "Glitch", "Overclock"],
        matches_played: 5,
        wins: 1,
        kills: 34,
        placement_points: 44,
        kill_points: 34,
        bonus_points: 5,
        total_points: 83,
        rank: 3
      },
      {
        id: 4,
        tournament_id: 1,
        team_name: "Quantum Titans",
        tag: "QTN",
        logo_url: "\u269B\uFE0F",
        captain_name: 'Farhan "Quark" Ali',
        captain_contact: "farhan.qtn@gmail.com",
        members: ["Quark", "Boson", "Entropy", "Proton"],
        matches_played: 5,
        wins: 1,
        kills: 28,
        placement_points: 38,
        kill_points: 28,
        bonus_points: 5,
        total_points: 71,
        rank: 4
      },
      {
        id: 5,
        tournament_id: 1,
        team_name: "Neon Strikers",
        tag: "NST",
        logo_url: "\u{1F3AF}",
        captain_name: 'Kavya "Viper" Nair',
        captain_contact: "kavya.nst@gmail.com",
        members: ["Viper", "Echo", "FrostByte", "Zero"],
        matches_played: 5,
        wins: 0,
        kills: 26,
        placement_points: 32,
        kill_points: 26,
        bonus_points: 0,
        total_points: 58,
        rank: 5
      },
      {
        id: 6,
        tournament_id: 1,
        team_name: "Apex Predators",
        tag: "APX",
        logo_url: "\u{1F43A}",
        captain_name: 'Dev "Apex" Verma',
        captain_contact: "dev.apx@gmail.com",
        members: ["Apex", "Raptor", "Fang", "Ghost"],
        matches_played: 5,
        wins: 0,
        kills: 22,
        placement_points: 26,
        kill_points: 22,
        bonus_points: 0,
        total_points: 48,
        rank: 6
      }
    ];
    state.esports_matches = [
      {
        id: 1,
        tournament_id: 1,
        match_title: "Match 1: Erangel Opening Clash",
        match_number: 1,
        map_name: "Erangel",
        played_at: "2026-08-20 18:00",
        mvp_player: "VP_Vortex (11 Kills)",
        results: [
          { team_id: 1, team_name: "Vortex Phantom", placement: 1, kills: 14, points: 29 },
          { team_id: 2, team_name: "Cyber Valkyries", placement: 2, kills: 8, points: 20 },
          { team_id: 3, team_name: "HyperDrive Gaming", placement: 3, kills: 7, points: 17 }
        ]
      },
      {
        id: 2,
        tournament_id: 1,
        match_title: "Match 2: Miramar High Desert",
        match_number: 2,
        map_name: "Miramar",
        played_at: "2026-08-21 19:30",
        mvp_player: "CVK_PixelQueen (9 Kills)",
        results: [
          { team_id: 2, team_name: "Cyber Valkyries", placement: 1, kills: 12, points: 27 },
          { team_id: 4, team_name: "Quantum Titans", placement: 2, kills: 9, points: 21 },
          { team_id: 1, team_name: "Vortex Phantom", placement: 3, kills: 8, points: 18 }
        ]
      }
    ];
  }
  saveToDisk();
}
var database_default = db;

// server/routes/auth.js
import express from "express";
import bcrypt2 from "bcryptjs";
import jwt2 from "jsonwebtoken";

// server/middleware/auth.js
import jwt from "jsonwebtoken";
var JWT_SECRET = process.env.JWT_SECRET || "nextgen-arvr-portal-super-secret-key-2026";
function authenticateAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: Admin authentication token required." });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Unauthorized: Token expired or invalid." });
  }
}
function logAdminAction(adminUsername, action, details) {
  try {
    database_default.insert("audit_logs", {
      admin_user: adminUsername || "admin",
      action: action || "UNKNOWN",
      details: typeof details === "object" ? JSON.stringify(details) : String(details || "")
    });
  } catch (err) {
    console.error("Failed to log admin action:", err);
  }
}

// server/routes/auth.js
var router = express.Router();
router.post("/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }
  const cleanEmail = email.trim().toLowerCase();
  const admin = db.get("admins", (a) => a.email && a.email.toLowerCase() === cleanEmail || a.username === email.trim());
  if (!admin) {
    return res.status(401).json({ error: "Invalid admin credentials." });
  }
  const isMatch = bcrypt2.compareSync(password, admin.password_hash);
  if (!isMatch) {
    return res.status(401).json({ error: "Invalid admin credentials." });
  }
  db.update("admins", (a) => a.id === admin.id, { last_login: (/* @__PURE__ */ new Date()).toISOString() });
  const token = jwt2.sign(
    { id: admin.id, username: admin.username, email: admin.email, role: admin.role },
    JWT_SECRET,
    { expiresIn: "24h" }
  );
  logAdminAction(admin.username, "ADMIN_LOGIN", `Admin logged in successfully.`);
  return res.json({
    message: "Authentication successful",
    token,
    admin: {
      id: admin.id,
      username: admin.username,
      email: admin.email,
      role: admin.role
    }
  });
});
router.get("/verify", authenticateAdmin, (req, res) => {
  const admin = db.get("admins", (a) => a.id === req.admin.id);
  if (!admin) {
    return res.status(404).json({ error: "Admin account not found." });
  }
  const { password_hash, ...safeAdmin } = admin;
  return res.json({ admin: safeAdmin });
});
router.post("/change-password", authenticateAdmin, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: "New password must be at least 6 characters long." });
  }
  const admin = db.get("admins", (a) => a.id === req.admin.id);
  const isMatch = bcrypt2.compareSync(currentPassword, admin.password_hash);
  if (!isMatch) {
    return res.status(400).json({ error: "Incorrect current password." });
  }
  const salt = bcrypt2.genSaltSync(10);
  const newHash = bcrypt2.hashSync(newPassword, salt);
  db.update("admins", (a) => a.id === req.admin.id, { password_hash: newHash });
  logAdminAction(req.admin.username, "PASSWORD_CHANGE", "Admin updated password");
  return res.json({ message: "Password updated successfully." });
});
var auth_default = router;

// server/routes/members.js
import express2 from "express";
var router2 = express2.Router();
router2.get("/", (req, res) => {
  const { domain, status, search, year } = req.query;
  let members = db.all("members", (m) => {
    let match = true;
    if (domain && domain !== "all") {
      match = match && m.domain && m.domain.toLowerCase().includes(domain.toLowerCase());
    }
    if (status && status !== "all") {
      match = match && m.status === status;
    }
    if (year && year !== "all") {
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
  members.sort((a, b) => {
    const statusOrder = { core_team: 1, active: 2, alumni: 3 };
    const orderA = statusOrder[a.status] || 4;
    const orderB = statusOrder[b.status] || 4;
    if (orderA !== orderB) return orderA - orderB;
    return (a.id || 0) - (b.id || 0);
  });
  return res.json({ members, count: members.length });
});
router2.get("/:id", (req, res) => {
  const member = db.get("members", (m) => m.id === parseInt(req.params.id, 10));
  if (!member) {
    return res.status(404).json({ error: "Member not found." });
  }
  return res.json({ member });
});
router2.post("/", authenticateAdmin, (req, res) => {
  const { full_name, roll_no, branch, year, domain, role, email, phone, bio, avatar_url, github_url, linkedin_url, portfolio_url, status } = req.body;
  if (!full_name || !roll_no || !email) {
    return res.status(400).json({ error: "Full name, roll number, and email are required." });
  }
  const existing = db.get("members", (m) => m.roll_no.toLowerCase() === roll_no.trim().toLowerCase() || m.email.toLowerCase() === email.trim().toLowerCase());
  if (existing) {
    return res.status(400).json({ error: "A member with this roll number or email already exists." });
  }
  const newMember = db.insert("members", {
    full_name: full_name.trim(),
    roll_no: roll_no.trim().toUpperCase(),
    branch: branch || "Computer Science",
    year: year || "2nd Year",
    domain: domain || "AR/VR & Spatial Computing",
    role: role || "Member",
    email: email.trim().toLowerCase(),
    phone: phone || "",
    bio: bio || "",
    avatar_url: avatar_url || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=400",
    github_url: github_url || "",
    linkedin_url: linkedin_url || "",
    portfolio_url: portfolio_url || "",
    status: status || "active",
    joined_at: (/* @__PURE__ */ new Date()).toISOString().split("T")[0]
  });
  logAdminAction(req.admin.username, "ADD_MEMBER", { member_id: newMember.id, full_name, roll_no });
  return res.status(201).json({ message: "Member created successfully", member: newMember });
});
router2.put("/:id", authenticateAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = db.get("members", (m) => m.id === id);
  if (!existing) {
    return res.status(404).json({ error: "Member not found." });
  }
  const updated = db.update("members", (m) => m.id === id, req.body);
  logAdminAction(req.admin.username, "EDIT_MEMBER", { member_id: id, full_name: updated.full_name });
  return res.json({ message: "Member updated successfully", member: updated });
});
router2.delete("/:id", authenticateAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = db.get("members", (m) => m.id === id);
  if (!existing) {
    return res.status(404).json({ error: "Member not found." });
  }
  db.delete("members", (m) => m.id === id);
  logAdminAction(req.admin.username, "DELETE_MEMBER", { member_id: id, full_name: existing.full_name });
  return res.json({ message: "Member deleted successfully." });
});
var members_default = router2;

// server/routes/applications.js
import express3 from "express";
var router3 = express3.Router();
router3.post("/", (req, res) => {
  const { full_name, roll_no, branch, year, email, phone, domains, why_join, experience, portfolio_url } = req.body;
  if (!full_name || !roll_no || !email || !phone || !branch || !year || !why_join) {
    return res.status(400).json({ error: "Please fill in all required application fields." });
  }
  const recruitmentStatus = db.getSetting("recruitment_status", { is_open: true });
  if (recruitmentStatus && recruitmentStatus.is_open === false) {
    return res.status(400).json({ error: "Recruitment is currently closed. Stay tuned for upcoming cycles!" });
  }
  const existing = db.get(
    "applications",
    (a) => (a.roll_no.toLowerCase() === roll_no.trim().toLowerCase() || a.email.toLowerCase() === email.trim().toLowerCase()) && a.status === "pending"
  );
  if (existing) {
    return res.status(400).json({ error: "You have already submitted an active application under review." });
  }
  const newApp = db.insert("applications", {
    full_name: full_name.trim(),
    roll_no: roll_no.trim().toUpperCase(),
    branch: branch.trim(),
    year: year.trim(),
    email: email.trim().toLowerCase(),
    phone: phone.trim(),
    domains: Array.isArray(domains) ? domains : [domains || "AR/VR & Spatial Computing"],
    why_join: why_join.trim(),
    experience: experience ? experience.trim() : "",
    portfolio_url: portfolio_url ? portfolio_url.trim() : "",
    status: "pending",
    review_notes: "",
    submitted_at: (/* @__PURE__ */ new Date()).toISOString()
  });
  return res.status(201).json({
    message: "Application submitted successfully! Our core team will review your application soon.",
    application_id: newApp.id,
    tracking_code: `NEXTGEN-APP-${String(newApp.id).padStart(4, "0")}`
  });
});
router3.get("/", authenticateAdmin, (req, res) => {
  const { status, search, domain } = req.query;
  let apps = db.all("applications", (a) => {
    let match = true;
    if (status && status !== "all") {
      match = match && a.status === status;
    }
    if (domain && domain !== "all") {
      match = match && Array.isArray(a.domains) && a.domains.some((d) => d.toLowerCase().includes(domain.toLowerCase()));
    }
    if (search && search.trim()) {
      const s = search.trim().toLowerCase();
      match = match && (a.full_name && a.full_name.toLowerCase().includes(s) || a.roll_no && a.roll_no.toLowerCase().includes(s) || a.email && a.email.toLowerCase().includes(s) || a.branch && a.branch.toLowerCase().includes(s));
    }
    return match;
  });
  apps.sort((a, b) => new Date(b.submitted_at || b.created_at) - new Date(a.submitted_at || a.created_at));
  return res.json({ applications: apps, count: apps.length });
});
router3.put("/:id/review", authenticateAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { status, review_notes, assigned_domain, assigned_role } = req.body;
  if (!status || !["approved", "rejected", "pending"].includes(status)) {
    return res.status(400).json({ error: "Status must be approved, rejected, or pending." });
  }
  const app2 = db.get("applications", (a) => a.id === id);
  if (!app2) {
    return res.status(404).json({ error: "Application not found." });
  }
  const updatedApp = db.update("applications", (a) => a.id === id, {
    status,
    review_notes: review_notes || app2.review_notes || "",
    reviewed_at: (/* @__PURE__ */ new Date()).toISOString(),
    reviewed_by: req.admin.username
  });
  let createdMember = null;
  if (status === "approved") {
    const existingMember = db.get("members", (m) => m.roll_no.toLowerCase() === app2.roll_no.toLowerCase() || m.email.toLowerCase() === app2.email.toLowerCase());
    if (!existingMember) {
      const primaryDomain = assigned_domain || Array.isArray(app2.domains) && app2.domains[0] || "AR/VR & Spatial Computing";
      createdMember = db.insert("members", {
        full_name: app2.full_name,
        roll_no: app2.roll_no,
        branch: app2.branch,
        year: app2.year,
        domain: primaryDomain,
        role: assigned_role || "Member",
        email: app2.email,
        phone: app2.phone,
        bio: app2.why_join ? app2.why_join.slice(0, 180) + "..." : "NextGen AR/VR club member",
        avatar_url: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(app2.full_name)}`,
        github_url: "",
        linkedin_url: "",
        portfolio_url: app2.portfolio_url || "",
        status: "active",
        joined_at: (/* @__PURE__ */ new Date()).toISOString().split("T")[0]
      });
    }
  }
  logAdminAction(req.admin.username, `APPLICATION_${status.toUpperCase()}`, {
    application_id: id,
    applicant_name: app2.full_name,
    roll_no: app2.roll_no,
    member_created: !!createdMember
  });
  return res.json({
    message: `Application has been marked as ${status}.`,
    application: updatedApp,
    createdMember
  });
});
var applications_default = router3;

// server/routes/events.js
import express4 from "express";
var router4 = express4.Router();
function enrichEvent(event) {
  const registrations = db.all("event_registrations", (r) => r.event_id === event.id);
  const totalRegistrants = registrations.length;
  const spotsRemaining = Math.max(0, (event.max_seats || 100) - totalRegistrants);
  return {
    ...event,
    total_registrants: totalRegistrants,
    spots_remaining: spotsRemaining,
    is_full: spotsRemaining === 0
  };
}
router4.get("/", (req, res) => {
  const { category, type, search } = req.query;
  const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  let events = db.all("events", (e) => {
    let match = true;
    if (category && category !== "all") {
      match = match && e.category && e.category.toLowerCase() === category.toLowerCase();
    }
    if (type === "upcoming") {
      match = match && e.event_date >= today;
    } else if (type === "past") {
      match = match && e.event_date < today;
    }
    if (search && search.trim()) {
      const s = search.trim().toLowerCase();
      match = match && (e.title && e.title.toLowerCase().includes(s) || e.description && e.description.toLowerCase().includes(s) || e.venue && e.venue.toLowerCase().includes(s));
    }
    return match;
  });
  const enriched = events.map(enrichEvent);
  if (type === "past") {
    enriched.sort((a, b) => new Date(b.event_date) - new Date(a.event_date));
  } else {
    enriched.sort((a, b) => new Date(a.event_date) - new Date(b.event_date));
  }
  return res.json({ events: enriched, count: enriched.length });
});
router4.get("/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const event = db.get("events", (e) => e.id === id || e.slug === req.params.id);
  if (!event) {
    return res.status(404).json({ error: "Event not found." });
  }
  const enriched = enrichEvent(event);
  return res.json({ event: enriched });
});
router4.post("/:id/register", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const event = db.get("events", (e) => e.id === id);
  if (!event) {
    return res.status(404).json({ error: "Event not found." });
  }
  if (event.is_registration_open === 0 || event.is_registration_open === false) {
    return res.status(400).json({ error: "Registration for this event is currently closed." });
  }
  const { full_name, roll_no, email, phone, branch, year, is_team, team_name, team_members_info } = req.body;
  if (!full_name || !roll_no || !email || !phone) {
    return res.status(400).json({ error: "Please provide full name, roll number, email, and phone." });
  }
  if (is_team && (!team_name || !team_name.trim())) {
    return res.status(400).json({ error: "Team name is required for team registrations." });
  }
  const existing = db.get(
    "event_registrations",
    (r) => r.event_id === id && (r.roll_no.toLowerCase() === roll_no.trim().toLowerCase() || r.email.toLowerCase() === email.trim().toLowerCase())
  );
  if (existing) {
    return res.status(400).json({ error: "You have already registered for this event." });
  }
  const currentCount = db.count("event_registrations", (r) => r.event_id === id);
  if (currentCount >= (event.max_seats || 100)) {
    return res.status(400).json({ error: "Event has reached maximum capacity." });
  }
  const registration = db.insert("event_registrations", {
    event_id: id,
    full_name: full_name.trim(),
    roll_no: roll_no.trim().toUpperCase(),
    email: email.trim().toLowerCase(),
    phone: phone.trim(),
    branch: branch || "Engineering",
    year: year || "2nd Year",
    is_team: is_team ? 1 : 0,
    team_name: team_name ? team_name.trim() : "",
    team_members_info: team_members_info ? team_members_info.trim() : "",
    status: "confirmed",
    registered_at: (/* @__PURE__ */ new Date()).toISOString()
  });
  return res.status(201).json({
    message: "Event registration confirmed! See you at the event.",
    registration_id: registration.id,
    ticket_id: `NG-${event.category.slice(0, 3).toUpperCase()}-${String(registration.id).padStart(4, "0")}`
  });
});
function handleBatchSync(req, res) {
  const eventsList = req.body.events;
  if (!Array.isArray(eventsList)) {
    return res.status(400).json({ error: "Expected an array of events." });
  }
  const sanitized = eventsList.filter((e) => e && (e.title || "").trim()).map((e, idx) => ({
    id: e.id || Date.now() + idx,
    title: (e.title || "").trim(),
    slug: e.slug || (e.title || "event").toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    category: e.category || "Workshop",
    event_date: e.event_date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
    event_time: e.event_time || "02:00 PM - 05:00 PM",
    venue: (e.venue || "").trim(),
    description: (e.description || "").trim(),
    poster_url: e.poster_url || "https://images.unsplash.com/photo-1592478411213-6153e4ebc07d?auto=format&fit=crop&q=80&w=800",
    is_registration_open: e.is_registration_open !== void 0 ? e.is_registration_open ? 1 : 0 : 1,
    max_seats: parseInt(e.max_seats, 10) || 100,
    is_team_event: e.is_team_event ? 1 : 0,
    max_team_size: parseInt(e.max_team_size, 10) || 4,
    tags: Array.isArray(e.tags) ? e.tags : e.tags ? String(e.tags).split(",").map((t) => t.trim()) : ["AR/VR", "NextGen"],
    feedbackQuestions: Array.isArray(e.feedbackQuestions) ? e.feedbackQuestions : [],
    created_at: e.created_at || (/* @__PURE__ */ new Date()).toISOString()
  }));
  db.setAll("events", sanitized);
  return res.json({ success: true, count: sanitized.length, events: sanitized });
}
router4.post("/sync", handleBatchSync);
router4.post("/batch", handleBatchSync);
router4.post("/", (req, res, next) => {
  if (req.body && Array.isArray(req.body.events)) {
    return handleBatchSync(req, res);
  }
  return authenticateAdmin(req, res, () => {
    const { title, category, event_date, event_time, venue, description, poster_url, is_registration_open, max_seats, is_team_event, max_team_size, tags, feedbackQuestions } = req.body;
    if (!title || !event_date || !venue || !description) {
      return res.status(400).json({ error: "Title, date, venue, and description are required." });
    }
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Date.now().toString().slice(-4);
    const newEvent = db.insert("events", {
      title: title.trim(),
      slug,
      category: category || "Workshop",
      event_date,
      event_time: event_time || "02:00 PM - 05:00 PM",
      venue: venue.trim(),
      description: description.trim(),
      poster_url: poster_url || "https://images.unsplash.com/photo-1592478411213-6153e4ebc07d?auto=format&fit=crop&q=80&w=800",
      is_registration_open: is_registration_open !== void 0 ? is_registration_open ? 1 : 0 : 1,
      max_seats: parseInt(max_seats, 10) || 100,
      is_team_event: is_team_event ? 1 : 0,
      max_team_size: parseInt(max_team_size, 10) || 4,
      tags: Array.isArray(tags) ? tags : tags ? String(tags).split(",").map((t) => t.trim()) : ["AR/VR", "NextGen"],
      feedbackQuestions: Array.isArray(feedbackQuestions) ? feedbackQuestions : [],
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    });
    logAdminAction(req.admin.username, "CREATE_EVENT", { event_id: newEvent.id, title });
    return res.status(201).json({ message: "Event created successfully", event: newEvent });
  });
});
router4.put("/:id", authenticateAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = db.get("events", (e) => e.id === id);
  if (!existing) {
    return res.status(404).json({ error: "Event not found." });
  }
  const updatePayload = { ...req.body };
  if (updatePayload.is_registration_open !== void 0) {
    updatePayload.is_registration_open = updatePayload.is_registration_open ? 1 : 0;
  }
  if (updatePayload.max_seats !== void 0) {
    updatePayload.max_seats = parseInt(updatePayload.max_seats, 10);
  }
  if (updatePayload.tags && typeof updatePayload.tags === "string") {
    updatePayload.tags = updatePayload.tags.split(",").map((t) => t.trim());
  }
  const updated = db.update("events", (e) => e.id === id, updatePayload);
  logAdminAction(req.admin.username, "EDIT_EVENT", { event_id: id, title: updated.title });
  return res.json({ message: "Event updated successfully", event: updated });
});
router4.delete("/:id", authenticateAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = db.get("events", (e) => e.id === id);
  if (!existing) {
    return res.status(404).json({ error: "Event not found." });
  }
  db.delete("events", (e) => e.id === id);
  db.delete("event_registrations", (r) => r.event_id === id);
  logAdminAction(req.admin.username, "DELETE_EVENT", { event_id: id, title: existing.title });
  return res.json({ message: "Event deleted successfully." });
});
router4.get("/:id/registrants", authenticateAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const event = db.get("events", (e) => e.id === id);
  if (!event) {
    return res.status(404).json({ error: "Event not found." });
  }
  const registrants = db.all("event_registrations", (r) => r.event_id === id);
  return res.json({ event, registrants, count: registrants.length });
});
var events_default = router4;

// server/routes/feedback.js
import express5 from "express";
var router5 = express5.Router();
router5.post("/", (req, res) => {
  const { event_id, event_title, rating_content, rating_organization, rating_speaker, what_liked, what_improve, comments, author_name, author_email } = req.body;
  const rContent = parseInt(rating_content, 10);
  const rOrg = parseInt(rating_organization, 10);
  const rSpeaker = parseInt(rating_speaker, 10);
  if (!rContent || !rOrg || !rSpeaker || rContent < 1 || rContent > 5 || rOrg < 1 || rOrg > 5 || rSpeaker < 1 || rSpeaker > 5) {
    return res.status(400).json({ error: "Please provide valid 1-5 star ratings for all categories." });
  }
  let finalTitle = event_title || "General Club Feedback";
  if (event_id) {
    const event = db.get("events", (e) => e.id === parseInt(event_id, 10));
    if (event) finalTitle = event.title;
  }
  const feedback = db.insert("feedback", {
    event_id: event_id ? parseInt(event_id, 10) : null,
    event_title: finalTitle,
    rating_content: rContent,
    rating_organization: rOrg,
    rating_speaker: rSpeaker,
    what_liked: what_liked ? what_liked.trim() : "",
    what_improve: what_improve ? what_improve.trim() : "",
    comments: comments ? comments.trim() : "",
    author_name: author_name ? author_name.trim() : "Anonymous Member",
    author_email: author_email ? author_email.trim().toLowerCase() : "",
    submitted_at: (/* @__PURE__ */ new Date()).toISOString()
  });
  return res.status(201).json({
    message: "Thank you for your valuable feedback! Your response has been recorded.",
    feedback_id: feedback.id
  });
});
router5.get("/", authenticateAdmin, (req, res) => {
  const { event_id } = req.query;
  let feedbackList = db.all("feedback", (f) => {
    if (event_id && event_id !== "all") {
      return f.event_id === parseInt(event_id, 10);
    }
    return true;
  });
  const total = feedbackList.length;
  let avgContent = 0;
  let avgOrg = 0;
  let avgSpeaker = 0;
  let overallAvg = 0;
  const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  if (total > 0) {
    let sumContent = 0;
    let sumOrg = 0;
    let sumSpeaker = 0;
    for (const f of feedbackList) {
      sumContent += f.rating_content;
      sumOrg += f.rating_organization;
      sumSpeaker += f.rating_speaker;
      const itemAvg = Math.round((f.rating_content + f.rating_organization + f.rating_speaker) / 3);
      if (distribution[itemAvg] !== void 0) {
        distribution[itemAvg]++;
      }
    }
    avgContent = Number((sumContent / total).toFixed(1));
    avgOrg = Number((sumOrg / total).toFixed(1));
    avgSpeaker = Number((sumSpeaker / total).toFixed(1));
    overallAvg = Number(((avgContent + avgOrg + avgSpeaker) / 3).toFixed(1));
  }
  feedbackList.sort((a, b) => new Date(b.submitted_at || b.created_at) - new Date(a.submitted_at || a.created_at));
  return res.json({
    feedback: feedbackList,
    stats: {
      total_responses: total,
      overall_avg: overallAvg,
      avg_content: avgContent,
      avg_organization: avgOrg,
      avg_speaker: avgSpeaker,
      distribution
    }
  });
});
var feedback_default = router5;

// server/routes/esports.js
import express6 from "express";
var router6 = express6.Router();
function recalculateLeaderboard(tournamentId) {
  const teams = db.all("esports_teams", (t) => t.tournament_id === tournamentId);
  teams.sort((a, b) => {
    if (b.total_points !== a.total_points) return b.total_points - a.total_points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.kills - a.kills;
  });
  teams.forEach((team, index) => {
    db.update("esports_teams", (t) => t.id === team.id, { rank: index + 1 });
  });
  return teams;
}
router6.get("/overview", (req, res) => {
  const games = db.all("esports_games");
  const tournaments = db.all("esports_tournaments");
  const matches = db.all("esports_matches");
  const enrichedTournaments = tournaments.map((t) => {
    const game = games.find((g) => g.id === t.game_id);
    const teamCount = db.count("esports_teams", (team) => team.tournament_id === t.id);
    return {
      ...t,
      game_name: game ? game.name : "Esports Game",
      game_slug: game ? game.slug : "general",
      team_count: teamCount
    };
  });
  const recentMatches = [...matches].sort((a, b) => new Date(b.played_at || b.created_at) - new Date(a.played_at || a.created_at)).slice(0, 5);
  return res.json({
    games,
    tournaments: enrichedTournaments,
    recentMatches
  });
});
router6.get("/tournaments/:id/leaderboard", (req, res) => {
  const tournamentId = parseInt(req.params.id, 10);
  const tournament = db.get("esports_tournaments", (t) => t.id === tournamentId);
  if (!tournament) {
    return res.status(404).json({ error: "Tournament not found." });
  }
  const game = db.get("esports_games", (g) => g.id === tournament.game_id);
  const teams = recalculateLeaderboard(tournamentId);
  const matches = db.all("esports_matches", (m) => m.tournament_id === tournamentId).sort((a, b) => (b.match_number || 0) - (a.match_number || 0));
  const podium = {
    first: teams[0] || null,
    second: teams[1] || null,
    third: teams[2] || null
  };
  return res.json({
    tournament: {
      ...tournament,
      game_name: game ? game.name : "Esports Game"
    },
    podium,
    leaderboard: teams,
    matches
  });
});
router6.post("/calculate", (req, res) => {
  const {
    scoring_type = "battle_royale",
    placement = 1,
    kills = 0,
    is_win = false,
    kill_multiplier = 1,
    win_bonus = 5,
    custom_placement_scale = null
  } = req.body;
  const numPlacement = parseInt(placement, 10) || 1;
  const numKills = parseInt(kills, 10) || 0;
  const kMult = parseFloat(kill_multiplier) || 1;
  const wBonus = parseFloat(win_bonus) || 0;
  let placementPoints = 0;
  let killPoints = numKills * kMult;
  let bonusPoints = is_win || numPlacement === 1 ? wBonus : 0;
  let breakdown = {};
  if (scoring_type === "battle_royale") {
    const scale = custom_placement_scale || {
      1: 15,
      2: 12,
      3: 10,
      4: 8,
      5: 6,
      6: 4,
      7: 2,
      8: 1,
      9: 1,
      10: 1
    };
    placementPoints = scale[numPlacement] !== void 0 ? scale[numPlacement] : 0;
    const total = placementPoints + killPoints + bonusPoints;
    breakdown = {
      formula: `(Placement Pts: ${placementPoints}) + (${numKills} Kills \xD7 ${kMult} = ${killPoints} Kill Pts) + (Winner Bonus: ${bonusPoints})`,
      placement_points: placementPoints,
      kill_points: killPoints,
      bonus_points: bonusPoints,
      total_points: total
    };
  } else if (scoring_type === "match_win") {
    const winPts = is_win ? 3 : 0;
    const total = winPts + killPoints + bonusPoints;
    breakdown = {
      formula: `(Match Result: ${winPts} Pts) + (${numKills} Frags \xD7 ${kMult} = ${killPoints} Kill Pts) + (Bonus: ${bonusPoints})`,
      placement_points: winPts,
      kill_points: killPoints,
      bonus_points: bonusPoints,
      total_points: total
    };
  }
  return res.json({
    scoring_type,
    input: { placement: numPlacement, kills: numKills, is_win },
    result: breakdown
  });
});
router6.post("/tournaments", authenticateAdmin, (req, res) => {
  const { title, game_id, prize_pool, status, start_date, end_date, venue, banner_url, registration_open, scoring_rules, description } = req.body;
  if (!title || !game_id) {
    return res.status(400).json({ error: "Tournament title and game selection are required." });
  }
  const game = db.get("esports_games", (g) => g.id === parseInt(game_id, 10));
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Date.now().toString().slice(-4);
  const defaultRules = game ? game.default_rules : {
    placement_scale: { 1: 15, 2: 12, 3: 10, 4: 8, 5: 6, 6: 4, 7: 2, 8: 1, 9: 1, 10: 1 },
    kill_multiplier: 1,
    win_bonus: 5
  };
  const tournament = db.insert("esports_tournaments", {
    title: title.trim(),
    slug,
    game_id: parseInt(game_id, 10),
    game_name: game ? game.name : "Esports Game",
    prize_pool: prize_pool || "TBD",
    status: status || "upcoming",
    start_date: start_date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
    end_date: end_date || "",
    venue: venue || "NextGen Esports Arena & Discord",
    banner_url: banner_url || (game ? game.banner_url : ""),
    registration_open: registration_open !== void 0 ? registration_open ? 1 : 0 : 1,
    scoring_rules: scoring_rules || defaultRules,
    description: description ? description.trim() : ""
  });
  logAdminAction(req.admin.username, "CREATE_TOURNAMENT", { tournament_id: tournament.id, title });
  return res.status(201).json({ message: "Tournament created successfully", tournament });
});
router6.put("/tournaments/:id", authenticateAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = db.get("esports_tournaments", (t) => t.id === id);
  if (!existing) {
    return res.status(404).json({ error: "Tournament not found." });
  }
  const updated = db.update("esports_tournaments", (t) => t.id === id, req.body);
  logAdminAction(req.admin.username, "EDIT_TOURNAMENT", { tournament_id: id, title: updated.title });
  return res.json({ message: "Tournament updated successfully", tournament: updated });
});
router6.post("/teams", authenticateAdmin, (req, res) => {
  const { tournament_id, team_name, tag, logo_url, captain_name, captain_contact, members } = req.body;
  if (!tournament_id || !team_name || !captain_name) {
    return res.status(400).json({ error: "Tournament, team name, and captain name are required." });
  }
  const team = db.insert("esports_teams", {
    tournament_id: parseInt(tournament_id, 10),
    team_name: team_name.trim(),
    tag: tag ? tag.trim().toUpperCase() : team_name.slice(0, 3).toUpperCase(),
    logo_url: logo_url || "\u{1F3AE}",
    captain_name: captain_name.trim(),
    captain_contact: captain_contact || "",
    members: Array.isArray(members) ? members : members ? String(members).split(",").map((m) => m.trim()) : [captain_name],
    matches_played: 0,
    wins: 0,
    kills: 0,
    placement_points: 0,
    kill_points: 0,
    bonus_points: 0,
    total_points: 0,
    rank: 0
  });
  recalculateLeaderboard(parseInt(tournament_id, 10));
  logAdminAction(req.admin.username, "ADD_ESPORTS_TEAM", { tournament_id, team_name });
  return res.status(201).json({ message: "Team registered successfully", team });
});
router6.post("/matches", authenticateAdmin, (req, res) => {
  const { tournament_id, match_title, match_number, map_name, played_at, mvp_player, results } = req.body;
  const tId = parseInt(tournament_id, 10);
  const tournament = db.get("esports_tournaments", (t) => t.id === tId);
  if (!tournament) {
    return res.status(404).json({ error: "Tournament not found." });
  }
  if (!results || !Array.isArray(results) || results.length === 0) {
    return res.status(400).json({ error: "Match results array is required." });
  }
  const rules = tournament.scoring_rules || {
    placement_scale: { 1: 15, 2: 12, 3: 10, 4: 8, 5: 6, 6: 4, 7: 2, 8: 1, 9: 1, 10: 1 },
    kill_multiplier: 1,
    win_bonus: 5
  };
  const processedResults = [];
  for (const item of results) {
    const teamId = parseInt(item.team_id, 10);
    const placement = parseInt(item.placement, 10);
    const kills = parseInt(item.kills, 10) || 0;
    const placementPts = rules.placement_scale && rules.placement_scale[placement] || 0;
    const killPts = kills * (rules.kill_multiplier || 1);
    const winBonus = placement === 1 ? rules.win_bonus || 0 : 0;
    const matchTotalPoints = placementPts + killPts + winBonus;
    const team = db.get("esports_teams", (t) => t.id === teamId);
    if (team) {
      db.update("esports_teams", (t) => t.id === teamId, {
        matches_played: (team.matches_played || 0) + 1,
        wins: (team.wins || 0) + (placement === 1 ? 1 : 0),
        kills: (team.kills || 0) + kills,
        placement_points: (team.placement_points || 0) + placementPts,
        kill_points: (team.kill_points || 0) + killPts,
        bonus_points: (team.bonus_points || 0) + winBonus,
        total_points: (team.total_points || 0) + matchTotalPoints
      });
      processedResults.push({
        team_id: teamId,
        team_name: team.team_name,
        placement,
        kills,
        points: matchTotalPoints
      });
    }
  }
  const match = db.insert("esports_matches", {
    tournament_id: tId,
    match_title: match_title || `Match #${match_number || 1}`,
    match_number: parseInt(match_number, 10) || 1,
    map_name: map_name || "Standard Map",
    played_at: played_at || (/* @__PURE__ */ new Date()).toISOString().replace("T", " ").slice(0, 16),
    mvp_player: mvp_player || "",
    results: processedResults
  });
  const updatedLeaderboard = recalculateLeaderboard(tId);
  logAdminAction(req.admin.username, "RECORD_MATCH_RESULT", { tournament_id: tId, match_id: match.id });
  return res.status(201).json({
    message: "Match recorded and leaderboard recalculated successfully!",
    match,
    leaderboard: updatedLeaderboard
  });
});
router6.put("/teams/:id/adjust-points", authenticateAdmin, (req, res) => {
  const teamId = parseInt(req.params.id, 10);
  const { total_points_override, bonus_points_adjustment, reason } = req.body;
  const team = db.get("esports_teams", (t) => t.id === teamId);
  if (!team) {
    return res.status(404).json({ error: "Team not found." });
  }
  let newTotal = team.total_points;
  let newBonus = team.bonus_points || 0;
  if (total_points_override !== void 0) {
    newTotal = parseInt(total_points_override, 10);
  } else if (bonus_points_adjustment !== void 0) {
    const adj = parseInt(bonus_points_adjustment, 10) || 0;
    newBonus += adj;
    newTotal += adj;
  }
  const updated = db.update("esports_teams", (t) => t.id === teamId, {
    total_points: newTotal,
    bonus_points: newBonus
  });
  recalculateLeaderboard(team.tournament_id);
  logAdminAction(req.admin.username, "ADJUST_TEAM_POINTS", { team_id: teamId, team_name: team.team_name, newTotal, reason });
  return res.json({ message: "Team points adjusted successfully", team: updated });
});
var esports_default = router6;

// server/routes/cms.js
import express7 from "express";
var router7 = express7.Router();
router7.get("/settings", (req, res) => {
  const recruitment = db.getSetting("recruitment_status", { is_open: true, batch_name: "Fall 2026 Cohort" });
  const banner = db.getSetting("announcement_banner", { active: true, title: "Welcome to NextGen AR/VR" });
  const stats = db.getSetting("club_stats", { members_count: "250+", projects_count: "24+" });
  const contact = db.getSetting("contact_info", {});
  const esports_locked = Boolean(db.getSetting("esports_locked", false));
  return res.json({
    recruitment_status: recruitment,
    announcement_banner: banner,
    club_stats: stats,
    contact_info: contact,
    esports_locked
  });
});
router7.get("/esports-lock", (req, res) => {
  const locked = db.getSetting("esports_locked", false);
  return res.json({ locked: Boolean(locked) });
});
router7.post("/esports-lock", (req, res) => {
  const { locked } = req.body;
  const isLocked = Boolean(locked);
  db.setSetting("esports_locked", isLocked);
  return res.json({ success: true, locked: isLocked });
});
router7.put("/settings", authenticateAdmin, (req, res) => {
  const { key, value } = req.body;
  if (!key || value === void 0) {
    return res.status(400).json({ error: "Settings key and value are required." });
  }
  db.setSetting(key, value);
  logAdminAction(req.admin.username, "UPDATE_SITE_SETTING", { key, value });
  return res.json({ message: `Setting "${key}" updated successfully.`, key, value });
});
router7.get("/dashboard-stats", authenticateAdmin, (req, res) => {
  const totalMembers = db.count("members");
  const activeMembers = db.count("members", (m) => m.status === "active" || m.status === "core_team");
  const pendingApplications = db.count("applications", (a) => a.status === "pending");
  const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const upcomingEvents = db.count("events", (e) => e.event_date >= today);
  const totalRegistrations = db.count("event_registrations");
  const totalFeedback = db.count("feedback");
  const activeTournaments = db.count("esports_tournaments", (t) => t.status === "live");
  const feedbackList = db.all("feedback");
  let avgFeedback = 0;
  if (feedbackList.length > 0) {
    const sum = feedbackList.reduce((acc, f) => acc + (f.rating_content + f.rating_organization + f.rating_speaker) / 3, 0);
    avgFeedback = Number((sum / feedbackList.length).toFixed(1));
  }
  const recentApps = db.all("applications").sort((a, b) => new Date(b.submitted_at || b.created_at) - new Date(a.submitted_at || a.created_at)).slice(0, 5);
  const recentFeedback = db.all("feedback").sort((a, b) => new Date(b.submitted_at || b.created_at) - new Date(a.submitted_at || a.created_at)).slice(0, 5);
  const auditLogs = db.all("audit_logs").sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10);
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
router7.get("/audit-logs", authenticateAdmin, (req, res) => {
  const logs = db.all("audit_logs").sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return res.json({ logs });
});
var cms_default = router7;

// server/routes/export.js
import express8 from "express";
var router8 = express8.Router();
function sanitizeCsvValue(val) {
  if (val === null || val === void 0) return '""';
  let str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}
function generateCsv(headers, rows) {
  const headerLine = headers.map((h) => sanitizeCsvValue(h.label)).join(",");
  const dataLines = rows.map((row) => {
    return headers.map((h) => sanitizeCsvValue(h.getter ? h.getter(row) : row[h.key])).join(",");
  });
  return "\uFEFF" + [headerLine, ...dataLines].join("\r\n");
}
router8.get("/members.csv", authenticateAdmin, (req, res) => {
  const members = db.all("members");
  const headers = [
    { key: "id", label: "Member ID" },
    { key: "full_name", label: "Full Name" },
    { key: "roll_no", label: "Roll Number" },
    { key: "branch", label: "Branch" },
    { key: "year", label: "Year" },
    { key: "domain", label: "Domain" },
    { key: "role", label: "Role" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "status", label: "Status" },
    { key: "joined_at", label: "Joined Date" }
  ];
  const csv = generateCsv(headers, members);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="nextgen_members.csv"');
  return res.send(csv);
});
router8.get("/applications.csv", authenticateAdmin, (req, res) => {
  const apps = db.all("applications");
  const headers = [
    { key: "id", label: "Application ID" },
    { key: "full_name", label: "Full Name" },
    { key: "roll_no", label: "Roll Number" },
    { key: "branch", label: "Branch" },
    { key: "year", label: "Year" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { getter: (a) => Array.isArray(a.domains) ? a.domains.join(", ") : a.domains, label: "Interested Domains" },
    { key: "why_join", label: "Motivation" },
    { key: "experience", label: "Prior Experience" },
    { key: "portfolio_url", label: "Portfolio URL" },
    { key: "status", label: "Review Status" },
    { key: "submitted_at", label: "Submitted At" }
  ];
  const csv = generateCsv(headers, apps);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="nextgen_applications.csv"');
  return res.send(csv);
});
router8.get("/registrants.csv", authenticateAdmin, (req, res) => {
  const registrants = db.all("event_registrations");
  const events = db.all("events");
  const eventMap = {};
  events.forEach((e) => {
    eventMap[e.id] = e.title;
  });
  const headers = [
    { key: "id", label: "Registration ID" },
    { getter: (r) => eventMap[r.event_id] || `Event #${r.event_id}`, label: "Event Title" },
    { key: "full_name", label: "Attendee Name" },
    { key: "roll_no", label: "Roll Number" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "branch", label: "Branch" },
    { key: "year", label: "Year" },
    { getter: (r) => r.is_team ? "Team" : "Solo", label: "Mode" },
    { key: "team_name", label: "Team Name" },
    { key: "team_members_info", label: "Team Members" },
    { key: "registered_at", label: "Registered At" }
  ];
  const csv = generateCsv(headers, registrants);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="nextgen_all_registrations.csv"');
  return res.send(csv);
});
router8.get("/registrants/:eventId.csv", authenticateAdmin, (req, res) => {
  const eventId = parseInt(req.params.eventId, 10);
  const event = db.get("events", (e) => e.id === eventId);
  const registrants = db.all("event_registrations", (r) => r.event_id === eventId);
  const headers = [
    { key: "id", label: "Registration ID" },
    { key: "full_name", label: "Attendee Name" },
    { key: "roll_no", label: "Roll Number" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "branch", label: "Branch" },
    { key: "year", label: "Year" },
    { getter: (r) => r.is_team ? "Team" : "Solo", label: "Type" },
    { key: "team_name", label: "Team Name" },
    { key: "team_members_info", label: "Team Members" },
    { key: "registered_at", label: "Registration Date" }
  ];
  const csv = generateCsv(headers, registrants);
  const safeTitle = event ? event.title.replace(/[^a-zA-Z0-9]/g, "_") : "event";
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="registrants_${safeTitle}.csv"`);
  return res.send(csv);
});
router8.get("/feedback.csv", authenticateAdmin, (req, res) => {
  const feedbackList = db.all("feedback");
  const headers = [
    { key: "id", label: "Feedback ID" },
    { key: "event_title", label: "Event / Session" },
    { key: "rating_content", label: "Content Rating (1-5)" },
    { key: "rating_organization", label: "Organization Rating (1-5)" },
    { key: "rating_speaker", label: "Speaker Rating (1-5)" },
    { getter: (f) => (((f.rating_content || 5) + (f.rating_organization || 5) + (f.rating_speaker || 5)) / 3).toFixed(1), label: "Average Score" },
    { key: "what_liked", label: "What Worked Well" },
    { key: "what_improve", label: "Suggested Improvements" },
    { key: "comments", label: "Open Comments" },
    { key: "author_name", label: "Submitted By" },
    { key: "author_email", label: "Email" },
    { key: "submitted_at", label: "Timestamp" }
  ];
  const csv = generateCsv(headers, feedbackList);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="nextgen_feedback.csv"');
  return res.send(csv);
});
router8.get("/backup.json", authenticateAdmin, (req, res) => {
  const backup = {
    export_timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    applications: db.all("applications"),
    members: db.all("members"),
    events: db.all("events"),
    registrations: db.all("event_registrations"),
    feedback: db.all("feedback")
  };
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="nextgen_backup_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json"`);
  return res.send(JSON.stringify(backup, null, 2));
});
var export_default = router8;

// server/index.js
var __filename2 = fileURLToPath2(import.meta.url);
var __dirname2 = path2.dirname(__filename2);
initDatabase();
var app = express9();
var PORT = process.env.PORT || 5e3;
app.use(cors());
app.use(express9.json({ limit: "10mb" }));
app.use(express9.urlencoded({ extended: true, limit: "10mb" }));
app.use((req, res, next) => {
  console.log(`[${(/* @__PURE__ */ new Date()).toISOString().slice(11, 19)}] ${req.method} ${req.url}`);
  next();
});
app.get("/api/health", (req, res) => res.json({
  status: "ok",
  service: "NextGen AR/VR API",
  cloud: getCloudStatus(),
  time: (/* @__PURE__ */ new Date()).toISOString()
}));
app.use("/api/auth", auth_default);
app.use("/api/members", members_default);
app.use("/api/applications", applications_default);
app.use("/api/events", events_default);
app.use("/api/feedback", feedback_default);
app.use("/api/esports", esports_default);
app.use("/api/cms", cms_default);
app.use("/api/admin/export", export_default);
app.get("/download/:filename", (req, res) => {
  const filename = path2.basename(req.params.filename);
  const scratchDir = path2.resolve(__dirname2, "..", "..");
  const primaryPath = path2.join(scratchDir, filename);
  const userDownloads = path2.join("C:", "Users", "darsh", "Downloads", filename);
  res.download(primaryPath, filename, (err) => {
    if (err) {
      res.download(userDownloads, filename, (err2) => {
        if (err2) res.status(404).json({ error: "File not found" });
      });
    }
  });
});
var candidateDistDirs = [
  path2.join(__dirname2, "dist"),
  path2.join(__dirname2, "..", "dist"),
  path2.join(process.cwd(), "dist"),
  path2.join(__dirname2, "public"),
  path2.join(process.cwd(), "public")
];
var resolvedDistDir = candidateDistDirs.find((d) => fs2.existsSync(path2.join(d, "index.html")));
if (resolvedDistDir) {
  console.log(`\u{1F310} Serving full frontend website from: ${resolvedDistDir}`);
  app.use(express9.static(resolvedDistDir));
}
app.get("*", (req, res, next) => {
  if (req.url.startsWith("/api")) return next();
  if (resolvedDistDir && fs2.existsSync(path2.join(resolvedDistDir, "index.html"))) {
    return res.sendFile(path2.join(resolvedDistDir, "index.html"));
  }
  const cloudInfo = getCloudStatus();
  res.status(200).send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>NextGen AR/VR \u2014 Backend Cloud API</title>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&family=Inter:wght@400;500&display=swap" rel="stylesheet" />
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            background: #080B10;
            color: #F1F5F9;
            font-family: 'Inter', sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 1.5rem;
          }
          .card {
            background: rgba(13, 17, 26, 0.9);
            border: 1px solid rgba(0, 240, 255, 0.25);
            box-shadow: 0 0 35px rgba(0, 240, 255, 0.15);
            border-radius: 16px;
            padding: 2.5rem;
            max-width: 620px;
            width: 100%;
            text-align: center;
          }
          h1 {
            font-family: 'Outfit', sans-serif;
            font-size: 1.8rem;
            color: #FFFFFF;
            margin-bottom: 0.5rem;
          }
          .badge {
            display: inline-block;
            background: rgba(0, 255, 157, 0.15);
            color: #00FF9D;
            border: 1px solid rgba(0, 255, 157, 0.35);
            padding: 0.35rem 0.85rem;
            border-radius: 999px;
            font-size: 0.85rem;
            font-weight: 600;
            margin-bottom: 1.25rem;
          }
          p { color: #94A3B8; font-size: 0.95rem; line-height: 1.6; margin-bottom: 1.5rem; }
          .db-box {
            background: rgba(0, 240, 255, 0.05);
            border: 1px solid rgba(0, 240, 255, 0.2);
            border-radius: 10px;
            padding: 1rem;
            margin-bottom: 1.5rem;
            text-align: left;
            font-size: 0.88rem;
            color: #CBD5E1;
          }
          .btn-row { display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap; }
          .btn {
            background: linear-gradient(135deg, #00F0FF, #8A2BE2);
            color: #000;
            font-weight: 700;
            text-decoration: none;
            padding: 0.7rem 1.4rem;
            border-radius: 8px;
            font-size: 0.9rem;
            display: inline-block;
            transition: transform 0.2s;
          }
          .btn:hover { transform: scale(1.03); }
          .btn-secondary {
            background: rgba(255, 255, 255, 0.08);
            color: #00F0FF;
            border: 1px solid rgba(0, 240, 255, 0.3);
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="badge">\u25CF Cloud API Online & Active</div>
          <h1>NextGen AR/VR Backend API</h1>
          <p>This is the high-performance cloud backend server for the NextGen AR/VR Portal.</p>
          
          <div class="db-box">
            <div><strong>Cloud Database:</strong> ${cloudInfo.isCloudDbActive ? '<span style="color:#00FF9D">Connected to MongoDB Atlas</span>' : '<span style="color:#FFB800">Local Cache</span>'}</div>
            <div style="margin-top:0.4rem;font-size:0.8rem;color:#64748B;">Ready to process cross-browser events, registrations, feedback, and authentication.</div>
          </div>

          <div class="btn-row">
            <a href="/api/events" class="btn">View Live Events JSON</a>
            <a href="/api/health" class="btn btn-secondary">API Health Status</a>
          </div>
        </div>
      </body>
    </html>
  `);
});
app.listen(PORT, "0.0.0.0", () => {
  console.log(`
======================================================`);
  console.log(`\u{1F680} NextGen AR/VR Portal API Server running on port ${PORT}`);
  console.log(`\u{1F310} Base URL: http://0.0.0.0:${PORT}`);
  console.log(`\u{1F511} Admin Login: admin@nextgenarvr.club / Admin@NextGen2026!`);
  console.log(`======================================================
`);
});
