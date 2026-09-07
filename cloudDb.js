import {
  initMongoDatabase,
  isMongoActive,
  syncMongoInsert,
  syncMongoUpdate,
  syncMongoDelete,
  syncMongoSetAll,
  syncMongoSetSetting,
  getMongoStatus,
  loadAllFromMongo,
  seedMongoIfEmpty
} from './mongoDb.js';

import {
  initPostgresDatabase,
  isPostgresActive,
  syncPostgresInsert,
  syncPostgresUpdate,
  syncPostgresDelete,
  syncPostgresSetAll,
  syncPostgresSetSetting,
  getPostgresStatus,
  loadAllFromPostgres,
  seedPostgresIfEmpty
} from './postgresDb.js';

export {
  initMongoDatabase,
  isMongoActive,
  getMongoStatus,
  loadAllFromMongo,
  seedMongoIfEmpty,
  initPostgresDatabase,
  isPostgresActive,
  getPostgresStatus,
  loadAllFromPostgres,
  seedPostgresIfEmpty
};

let activeCloudType = 'none'; // 'mongodb', 'postgres', or 'none'

export async function initCloudDatabase(onCloudReady) {
  // 1. Check MongoDB Atlas (MONGODB_URI / MONGO_URI)
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (mongoUri) {
    const mongoOk = await initMongoDatabase(onCloudReady);
    if (mongoOk) {
      activeCloudType = 'mongodb';
      return true;
    }
  }

  // 2. Check Supabase / PostgreSQL (DATABASE_URL / SUPABASE_DB_URL / POSTGRES_URL / SUPABASE_URL)
  const postgresOk = await initPostgresDatabase(onCloudReady);
  if (postgresOk) {
    activeCloudType = 'postgres';
    return true;
  }

  console.log('💾 Cloud Database variables not detected. Operating with local database persistence (database.json).');
  return false;
}

/**
 * Loads all collections/tables from active cloud database into memory state
 */
export async function loadAllFromCloud(state) {
  if (isMongoActive()) {
    return await loadAllFromMongo(state);
  }
  if (isPostgresActive()) {
    return await loadAllFromPostgres(state);
  }
  return false;
}

/**
 * Seeds cloud database if tables/collections are empty on first deployment
 */
export async function seedCloudIfEmpty(state) {
  if (isMongoActive()) {
    await seedMongoIfEmpty(state);
  } else if (isPostgresActive()) {
    await seedPostgresIfEmpty(state);
  }
}

/**
 * Syncs an inserted record to the active cloud database
 */
export async function syncToCloud(table, row) {
  sendWebhookNotification(table, row);

  if (isMongoActive()) {
    await syncMongoInsert(table, row);
  } else if (isPostgresActive()) {
    await syncPostgresInsert(table, row);
  }
}

/**
 * Syncs an update to the active cloud database
 */
export async function syncUpdateToCloud(table, predicate, updateData) {
  if (isMongoActive()) {
    await syncMongoUpdate(table, predicate, updateData);
  } else if (isPostgresActive()) {
    await syncPostgresUpdate(table, predicate, updateData);
  }
}

/**
 * Syncs a deletion to the active cloud database
 */
export async function syncDeleteToCloud(table, item) {
  if (isMongoActive()) {
    await syncMongoDelete(table, item);
  } else if (isPostgresActive()) {
    await syncPostgresDelete(table, item);
  }
}

/**
 * Batch replaces a collection/table in the active cloud database
 */
export async function syncSetAllToCloud(table, list) {
  if (isMongoActive()) {
    await syncMongoSetAll(table, list);
  } else if (isPostgresActive()) {
    await syncPostgresSetAll(table, list);
  }
}

/**
 * Syncs a site setting to the active cloud database
 */
export async function syncSettingToCloud(key, value) {
  if (isMongoActive()) {
    await syncMongoSetSetting(key, value);
  } else if (isPostgresActive()) {
    await syncPostgresSetSetting(key, value);
  }
}

/**
 * Optional webhook notifications
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
  const isCloudActive = isMongoActive() || isPostgresActive();
  let type = 'none';
  if (isMongoActive()) type = 'mongodb';
  else if (isPostgresActive()) type = 'supabase_postgres';

  return {
    isCloudDbActive: isCloudActive,
    cloudType: type,
    mongodb: getMongoStatus(),
    postgres: getPostgresStatus()
  };
}
