import mongoose from 'mongoose';

let isMongoConnected = false;
let mongoConnectionUri = '';

// Generic schema with strict: false so all portal fields, custom questionnaires,
// and domain models are preserved without rigid constraints.
const genericSchemaOptions = {
  strict: false,
  timestamps: true
};

const EventModel = mongoose.model('Event', new mongoose.Schema({
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
}, genericSchemaOptions), 'events');

const RegistrationModel = mongoose.model('Registration', new mongoose.Schema({
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
}, genericSchemaOptions), 'event_registrations');

const FeedbackModel = mongoose.model('Feedback', new mongoose.Schema({
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
}, genericSchemaOptions), 'feedback');

const MemberModel = mongoose.model('Member', new mongoose.Schema({
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
}, genericSchemaOptions), 'members');

const ApplicationModel = mongoose.model('Application', new mongoose.Schema({
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
}, genericSchemaOptions), 'applications');

const CmsModel = mongoose.model('SiteContent', new mongoose.Schema({
  key: { type: String, required: true, unique: true, index: true },
  value: mongoose.Schema.Types.Mixed
}, genericSchemaOptions), 'site_content');

const AdminModel = mongoose.model('Admin', new mongoose.Schema({
  id: { type: Number, index: true },
  username: String,
  email: String,
  password_hash: String,
  role: String
}, genericSchemaOptions), 'admins');

const AuditLogModel = mongoose.model('AuditLog', new mongoose.Schema({
  id: { type: Number, index: true },
  admin_user: String,
  action: String,
  details: mongoose.Schema.Types.Mixed,
  created_at: String
}, genericSchemaOptions), 'audit_logs');

const EsportsModel = mongoose.model('EsportsGame', new mongoose.Schema({
  id: { type: Number, index: true },
  name: String,
  slug: String,
  icon: String,
  format: String,
  description: String
}, genericSchemaOptions), 'esports_games');

const MODEL_MAP = {
  events: EventModel,
  event_registrations: RegistrationModel,
  feedback: FeedbackModel,
  members: MemberModel,
  applications: ApplicationModel,
  admins: AdminModel,
  audit_logs: AuditLogModel,
  esports_games: EsportsModel
};

/**
 * Connect to MongoDB Atlas (Render environment)
 */
export async function initMongoDatabase(onConnectedCallback) {
  const uri = process.env.MONGODB_URI || 
              process.env.MONGO_URI || 
              (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('mongodb') ? process.env.DATABASE_URL : null);

  if (!uri) {
    return false;
  }

  mongoConnectionUri = uri;
  try {
    const masked = uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
    console.log(`📡 Connecting to MongoDB Atlas (${masked})...`);

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 10000
    });

    isMongoConnected = true;
    console.log('✅ Cloud MongoDB Connected successfully to Render backend!');

    if (onConnectedCallback && typeof onConnectedCallback === 'function') {
      await onConnectedCallback();
    }

    return true;
  } catch (err) {
    console.error('⚠️ MongoDB connection notice:', err.message);
    isMongoConnected = false;
    return false;
  }
}

export function isMongoActive() {
  return isMongoConnected && mongoose.connection.readyState === 1;
}

export function getMongoStatus() {
  return {
    isMongoConnected: isMongoActive(),
    readyState: mongoose.connection.readyState,
    host: mongoose.connection.host || null,
    dbName: mongoose.connection.name || null
  };
}

/**
 * Hydrates local in-memory state from MongoDB collections
 */
export async function loadAllFromMongo(state) {
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
        state[table] = records.map(r => {
          const { _id, __v, ...clean } = r;
          return clean;
        });
        totalLoaded += records.length;
      }
    }

    // Load CMS site_content
    const cmsRecords = await CmsModel.find({}).lean();
    if (cmsRecords && cmsRecords.length > 0) {
      if (!state.site_content) state.site_content = {};
      for (const item of cmsRecords) {
        state.site_content[item.key] = item.value;
      }
    }

    console.log(`📥 Loaded ${totalLoaded} documents from MongoDB Atlas into active server state.`);
    return true;
  } catch (err) {
    console.error('Error loading from MongoDB:', err.message);
    return false;
  }
}

/**
 * Seeds MongoDB Atlas if collections are currently empty (e.g., first Render deployment)
 */
export async function seedMongoIfEmpty(state) {
  if (!isMongoActive()) return;

  try {
    for (const table of Object.keys(MODEL_MAP)) {
      const Model = MODEL_MAP[table];
      const count = await Model.countDocuments();
      if (count === 0 && Array.isArray(state[table]) && state[table].length > 0) {
        await Model.insertMany(state[table]);
        console.log(`🌱 Seeded ${state[table].length} initial records into MongoDB [${table}]`);
      }
    }

    // Seed site_content
    const cmsCount = await CmsModel.countDocuments();
    if (cmsCount === 0 && state.site_content && Object.keys(state.site_content).length > 0) {
      const docs = Object.entries(state.site_content).map(([key, value]) => ({ key, value }));
      await CmsModel.insertMany(docs);
      console.log(`🌱 Seeded ${docs.length} site_content settings into MongoDB`);
    }
  } catch (err) {
    console.error('Error seeding MongoDB:', err.message);
  }
}

/**
 * Synchronize document insert to MongoDB
 */
export async function syncMongoInsert(table, row) {
  if (!isMongoActive()) return;
  try {
    const Model = MODEL_MAP[table];
    if (Model) {
      await Model.create(row);
      console.log(`☁️ Synced new [${table}] record (ID: ${row.id}) to MongoDB Atlas`);
    }
  } catch (err) {
    console.error(`MongoDB insert error (${table}):`, err.message);
  }
}

/**
 * Synchronize document update to MongoDB
 */
export async function syncMongoUpdate(table, predicate, updateData) {
  if (!isMongoActive()) return;
  try {
    const Model = MODEL_MAP[table];
    if (Model) {
      const query = updateData.id ? { id: updateData.id } : {};
      if (query.id) {
        await Model.updateOne(query, { $set: updateData }, { upsert: true });
        console.log(`☁️ Synced [${table}] update (ID: ${updateData.id}) to MongoDB Atlas`);
      }
    }
  } catch (err) {
    console.error(`MongoDB update error (${table}):`, err.message);
  }
}

/**
 * Synchronize document deletion to MongoDB
 */
export async function syncMongoDelete(table, item) {
  if (!isMongoActive() || !item) return;
  try {
    const Model = MODEL_MAP[table];
    if (Model && item.id) {
      await Model.deleteOne({ id: item.id });
      console.log(`☁️ Synced [${table}] deletion (ID: ${item.id}) to MongoDB Atlas`);
    }
  } catch (err) {
    console.error(`MongoDB delete error (${table}):`, err.message);
  }
}

/**
 * Batch replace a collection in MongoDB (e.g. batch sync events)
 */
export async function syncMongoSetAll(table, list) {
  if (!isMongoActive()) return;
  try {
    const Model = MODEL_MAP[table];
    if (Model && Array.isArray(list)) {
      await Model.deleteMany({});
      if (list.length > 0) {
        await Model.insertMany(list);
      }
      console.log(`☁️ Synced batch [${table}] (${list.length} items) to MongoDB Atlas`);
    }
  } catch (err) {
    console.error(`MongoDB setAll error (${table}):`, err.message);
  }
}

/**
 * Synchronize site setting to MongoDB
 */
export async function syncMongoSetSetting(key, value) {
  if (!isMongoActive()) return;
  try {
    await CmsModel.updateOne({ key }, { $set: { key, value } }, { upsert: true });
    console.log(`☁️ Synced site_content setting [${key}] to MongoDB Atlas`);
  } catch (err) {
    console.error(`MongoDB setting error (${key}):`, err.message);
  }
}
