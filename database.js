import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { 
  initCloudDatabase, 
  syncToCloud, 
  syncUpdateToCloud, 
  syncDeleteToCloud, 
  syncSetAllToCloud, 
  syncSettingToCloud,
  loadAllFromCloud,
  seedCloudIfEmpty
} from './cloudDb.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, 'data');
const dbFile = path.join(dataDir, 'database.json');

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

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

// Persistence helper
function saveToDisk() {
  try {
    fs.writeFileSync(dbFile, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing to database.json:', err);
  }
}

function loadFromDisk() {
  if (fs.existsSync(dbFile)) {
    try {
      const data = fs.readFileSync(dbFile, 'utf-8');
      if (data && data.trim()) {
        state = JSON.parse(data);
      }
    } catch (err) {
      console.error('Error reading database.json:', err);
    }
  }
}

// Database Engine DAO
export const db = {
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
    const newRecord = {
      id,
      ...row,
      created_at: row.created_at || new Date().toISOString()
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
      updated_at: new Date().toISOString()
    };
    saveToDisk();
    syncUpdateToCloud(table, predicate, state[table][index]);
    return state[table][index];
  },

  delete(table, predicate) {
    if (!state[table]) return false;
    const initialLen = state[table].length;
    const toDelete = state[table].filter(predicate);
    state[table] = state[table].filter(item => !predicate(item));
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
    return state.site_content && state.site_content[key] !== undefined ? state.site_content[key] : defaultValue;
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

export async function initDatabase() {
  loadFromDisk();
  await initCloudDatabase(async () => {
    await loadAllFromCloud(state);
    await seedCloudIfEmpty(state);
    saveToDisk();
  });

  // 1. Seed Admin if empty
  if (!state.admins || state.admins.length === 0) {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync('Admin@NextGen2026!', salt);
    state.admins = [
      {
        id: 1,
        username: 'admin',
        email: 'admin@nextgenarvr.club',
        password_hash: hash,
        role: 'super_admin',
        created_at: new Date().toISOString(),
        last_login: null
      }
    ];
    console.log('✅ Default Admin seeded: admin@nextgenarvr.club / Admin@NextGen2026!');
  }

  // 2. Seed Site Content / CMS if empty
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

  // 3. Seed Members if empty
  if (!state.members || state.members.length === 0) {
    state.members = [
      {
        id: 1,
        full_name: 'Prof. Ananthanagu U',
        roll_no: '',
        branch: 'Information Technology',
        school: 'Information Technology',
        year: 'Faculty',
        domain: 'AR/VR & Immersive Technologies',
        role: 'Faculty Coordinator & Mentor',
        designation: 'Assistant Professor & Associate Director (In Charge) - Centre of Excellence (Immersive Technologies (AR/VR))',
        email: 'ananthanagu.u@alliance.edu.in',
        phone: '+91 98450 12345',
        bio: 'Assistant Professor & Associate Director (In Charge) - Centre of Excellence (Immersive Technologies (AR/VR)) at Alliance University. 14+ years of academic experience with research expertise in Data Science, Machine Learning, NLP, and Virtual Reality visualizations (IEEE ICVR 2023). Life member of CSI and ISTE.',
        avatar_url: 'https://www.alliance.edu.in/wp-content/uploads/faculty/core-faculty/mr-ananthanagu-u-v1.webp',
        github_url: '',
        linkedin_url: '',
        portfolio_url: 'https://www.alliance.edu.in/faculty/prof-ananthanagu-u/',
        status: 'core_team',
        is_faculty: true,
        joined_at: '2022-06-01'
      },
      {
        id: 2,
        full_name: 'Ms. Kusuma J',
        roll_no: '',
        branch: 'Information Technology',
        school: 'Information Technology',
        year: 'Faculty',
        domain: 'AI & Deep Learning',
        role: 'Faculty Coordinator & Mentor',
        designation: 'Assistant Professor, Department of Computer Science & Engineering',
        email: 'kusuma.j@alliance.edu.in',
        phone: '+91 98450 67890',
        bio: 'Assistant Professor in Computer Science & Engineering at Alliance University. 5+ years of teaching experience with research specialization in Image Processing, Data Analytics, Machine Learning, and Deep Learning. Published in IEEE & Springer. Life member of ISTE.',
        avatar_url: 'https://www.alliance.edu.in/wp-content/uploads/faculty/core-faculty/ms-kusuma-j.webp',
        github_url: '',
        linkedin_url: '',
        portfolio_url: 'https://www.alliance.edu.in/faculty/ms-kusuma-j/',
        status: 'core_team',
        is_faculty: true,
        joined_at: '2023-01-10'
      },
      {
        id: 3,
        full_name: 'S Darshan Sai',
        roll_no: '',
        branch: 'Information Technology',
        school: 'Information Technology',
        year: '3rd Year',
        domain: 'AR/VR & Spatial Innovation',
        role: 'President',
        email: 'president.nextgen@alliance.edu.in',
        phone: '',
        bio: 'President of NextGen (AR/VR) Reality Club (3rd Year, Information Technology). Leading spatial innovation, hardware initiatives, and immersive metaverse development at Alliance University.',
        avatar_url: '/assets/council/council_member_1.jpg',
        github_url: '',
        linkedin_url: '',
        portfolio_url: '',
        status: 'core_team',
        is_council: true,
        badge: 'PRESIDENT',
        joined_at: '2023-08-01'
      },
      {
        id: 4,
        full_name: 'Apoorva P Keretot',
        roll_no: '',
        branch: 'Information Technology',
        school: 'Information Technology',
        year: '3rd Year',
        domain: 'Executive Council & Technical Wings',
        role: 'Vice President',
        email: 'vp.nextgen@alliance.edu.in',
        phone: '',
        bio: 'Vice President of NextGen (AR/VR) Reality Club (3rd Year, Information Technology). Overseeing executive operations, technical domain workshops, and student community engagements.',
        avatar_url: '/assets/council/council_member_4.jpg',
        github_url: '',
        linkedin_url: '',
        portfolio_url: '',
        status: 'core_team',
        is_council: true,
        badge: 'VICE PRESIDENT',
        joined_at: '2023-08-15'
      },
      {
        id: 5,
        full_name: 'Rashmi',
        roll_no: '',
        branch: 'Information Technology',
        school: 'Information Technology',
        year: '3rd Year',
        domain: 'Administration & Governance',
        role: 'Secretary',
        email: 'secretary.nextgen@alliance.edu.in',
        phone: '',
        bio: 'Secretary of NextGen (AR/VR) Reality Club (3rd Year, Information Technology). Managing administrative governance, official council records, institutional communications, and student delegations.',
        avatar_url: '/assets/council/council_member_rashmi.jpg',
        github_url: '',
        linkedin_url: '',
        portfolio_url: '',
        status: 'core_team',
        is_council: true,
        badge: 'SECRETARY',
        joined_at: '2023-08-20'
      },
      {
        id: 6,
        full_name: 'Sudeep',
        roll_no: '',
        branch: 'Information Technology',
        school: 'Information Technology',
        year: '3rd Year',
        domain: 'Operations & Member Relations',
        role: 'Joint Secretary',
        email: 'jointsecretary.nextgen@alliance.edu.in',
        phone: '',
        bio: 'Joint Secretary of NextGen (AR/VR) Reality Club (3rd Year, Information Technology). Coordinating event operations, inter-domain logistics, club administration, and student outreach.',
        avatar_url: '/assets/council/council_member_sudeep.jpg',
        github_url: '',
        linkedin_url: '',
        portfolio_url: '',
        status: 'core_team',
        is_council: true,
        badge: 'JOINT SECRETARY',
        joined_at: '2023-08-25'
      },
      {
        id: 7,
        full_name: 'Puneeth N',
        roll_no: '',
        branch: 'Information Technology',
        school: 'Information Technology',
        year: '3rd Year',
        domain: 'Treasury & Resource Operations',
        role: 'Treasurer',
        email: 'treasurer.nextgen@alliance.edu.in',
        phone: '',
        bio: 'Council Member & Treasurer of NextGen (AR/VR) Reality Club (3rd Year, Information Technology). Managing club budget allocations, sponsorships, financial operations, and resources.',
        avatar_url: '/assets/council/council_member_3.jpg',
        github_url: '',
        linkedin_url: '',
        portfolio_url: '',
        status: 'core_team',
        is_council: true,
        badge: 'TREASURER',
        joined_at: '2023-09-01'
      },
      {
        id: 8,
        full_name: 'Koel Dutta',
        roll_no: '',
        branch: 'Information Technology',
        school: 'Information Technology',
        year: '3rd Year',
        domain: 'Student Operations & Community Lead',
        role: 'Executive Member',
        email: 'executive.nextgen@alliance.edu.in',
        phone: '',
        bio: 'Council Member & Executive Member Lead (3rd Year, Information Technology). Directing student delegations, domain wings engagement, and internal club initiatives.',
        avatar_url: '/assets/council/council_member_5.jpg',
        github_url: '',
        linkedin_url: '',
        portfolio_url: '',
        status: 'core_team',
        is_council: true,
        badge: 'EXECUTIVE MEMBER',
        joined_at: '2024-01-15'
      },
      {
        id: 9,
        full_name: 'Panchaksharayya',
        roll_no: '',
        branch: 'Information Technology',
        school: 'Information Technology',
        year: '3rd Year',
        domain: 'Media, PR & Documentation',
        role: 'Media and Documentation Coordinator',
        email: 'media.nextgen@alliance.edu.in',
        phone: '',
        bio: 'Council Member & Media and Documentation Coordinator (3rd Year, Information Technology). Managing documentation, institutional reporting, media production, and digital archives.',
        avatar_url: '/assets/council/council_member_2.jpg',
        github_url: '',
        linkedin_url: '',
        portfolio_url: '',
        status: 'core_team',
        is_council: true,
        badge: 'MEDIA & DOCUMENTATION',
        joined_at: '2023-09-10'
      }
    ];
  }

  // 4. Seed Events if empty
  if (!state.events) {
    state.events = [];
  }

  // 5. Seed Event Registrations if empty
  if (!state.event_registrations) {
    state.event_registrations = [];
  }

  // 6. Seed Applications if empty
  if (!state.applications || state.applications.length === 0) {
    state.applications = [
      {
        id: 1,
        full_name: 'Ishaan Verma',
        roll_no: '25CS034',
        branch: 'Computer Science',
        year: '1st Year',
        email: 'ishaan.v@college.edu',
        phone: '+91 98711 33445',
        domains: ['AR/VR & Spatial Computing', 'Game Development'],
        why_join: 'I have been experimenting with Unity VR development and want to collaborate with seniors on WebXR hackathons.',
        experience: 'Built a 3D solar system simulator in Unity and know basic C# scripting.',
        portfolio_url: 'https://github.com/ishaan-v-dev',
        status: 'pending',
        review_notes: '',
        submitted_at: '2026-08-20 11:45'
      },
      {
        id: 2,
        full_name: 'Sneha Roy',
        roll_no: '24ECE019',
        branch: 'Electronics & Comm.',
        year: '2nd Year',
        email: 'sneha.roy@college.edu',
        phone: '+91 98722 44556',
        domains: ['3D Design & Worldbuilding'],
        why_join: 'I create 3D environment assets in Blender and want to design immersive VR spaces for club projects.',
        experience: '2 years of Blender modeling, texturing with Substance Painter, and basic rigging.',
        portfolio_url: 'https://artstation.com/sneharoy3d',
        status: 'pending',
        review_notes: '',
        submitted_at: '2026-08-21 16:20'
      }
    ];
  }

  // 7. Seed Feedback if empty
  if (!state.feedback) {
    state.feedback = [];
  }

  // 8. Seed E-Sports Games, Tournaments, Teams & Matches (BGMI 16 Teams & Free Fire MAX 12 Teams)
  const hasFreeFire = Array.isArray(state.esports_tournaments) && state.esports_tournaments.some(t => t.id === 2);
  const hasLegacyValorant = Array.isArray(state.esports_games) && state.esports_games.some(g => g.name === 'Valorant');
  if (!state.esports_games || state.esports_games.length === 0 || !hasFreeFire || hasLegacyValorant) {
    state.esports_games = [
      {
        id: 1,
        name: 'BGMI (Battlegrounds Mobile India)',
        slug: 'bgmi',
        icon: 'Target',
        banner_url: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&q=80&w=1200',
        format: 'Squad Battle Royale (16 Teams)',
        scoring_type: 'battle_royale',
        default_rules: {
          system_name: 'Official BGIS / BMPS (10-Point)',
          placement_scale: { 1: 10, 2: 6, 3: 5, 4: 4, 5: 3, 6: 2, 7: 1, 8: 1, 9: 0, 10: 0, 11: 0, 12: 0, 13: 0, 14: 0, 15: 0, 16: 0 },
          kill_multiplier: 1,
          win_bonus: 0,
          win_title: 'WWCD 🍗'
        },
        description: 'Official collegiate Battle Royale championship featuring 16 top squads battling in Erangel, Miramar, and Sanhok.'
      },
      {
        id: 2,
        name: 'Free Fire MAX',
        slug: 'freefire-max',
        icon: 'Flame',
        banner_url: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?auto=format&fit=crop&q=80&w=1200',
        format: 'Squad Battle Royale (12 Teams)',
        scoring_type: 'battle_royale',
        default_rules: {
          system_name: 'Official FFWS / FFIC (12-Point)',
          placement_scale: { 1: 12, 2: 9, 3: 8, 4: 7, 5: 6, 6: 5, 7: 4, 8: 3, 9: 2, 10: 1, 11: 0, 12: 0 },
          kill_multiplier: 1,
          win_bonus: 0,
          win_title: 'BOOYAH 🔥'
        },
        description: 'Fast-paced Free Fire MAX competitive survival clash featuring 12 top squads across Bermuda, Purgatory, and Kalahari.'
      }
    ];

    state.esports_tournaments = [
      {
        id: 1,
        title: 'NextGen BGMI Masters Series 2026',
        slug: 'nextgen-bgmi-masters-series',
        game_id: 1,
        game_name: 'BGMI (Battlegrounds Mobile India)',
        prize_pool: '₹50,000 INR (~$600 USD)',
        status: 'live',
        start_date: '2026-09-20',
        end_date: '2026-10-15',
        venue: 'NextGen Spatial Esports Lab & YouTube Live',
        banner_url: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&q=80&w=1200',
        registration_open: 1,
        scoring_rules: {
          system_name: 'Official BGIS / BMPS (10-Point)',
          placement_scale: { 1: 10, 2: 6, 3: 5, 4: 4, 5: 3, 6: 2, 7: 1, 8: 1, 9: 0, 10: 0, 11: 0, 12: 0, 13: 0, 14: 0, 15: 0, 16: 0 },
          kill_multiplier: 1,
          win_bonus: 0,
          win_title: 'WWCD 🍗'
        },
        description: 'The premier college Battle Royale championship featuring 16 top squads battling across 5 rigorous map rotations.'
      },
      {
        id: 2,
        title: 'NextGen Free Fire MAX Clash Series 2026',
        slug: 'nextgen-free-fire-clash-series',
        game_id: 2,
        game_name: 'Free Fire MAX',
        prize_pool: '₹35,000 INR (~$420 USD)',
        status: 'live',
        start_date: '2026-09-20',
        end_date: '2026-10-15',
        venue: 'NextGen Esports Arena & Discord Stream',
        banner_url: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?auto=format&fit=crop&q=80&w=1200',
        registration_open: 1,
        scoring_rules: {
          system_name: 'Official FFWS / FFIC (12-Point)',
          placement_scale: { 1: 12, 2: 9, 3: 8, 4: 7, 5: 6, 6: 5, 7: 4, 8: 3, 9: 2, 10: 1, 11: 0, 12: 0 },
          kill_multiplier: 1,
          win_bonus: 0,
          win_title: 'BOOYAH 🔥'
        },
        description: 'High-octane Free Fire MAX survival clash featuring 12 top university squads competing in fast-paced Bermuda, Purgatory, and Kalahari drop-ins.'
      }
    ];

    state.esports_teams = [
      // BGMI Teams (Tournament 1)
      { id: 101, tournament_id: 1, slot: 1, team_name: 'Soul Esports', tag: 'SOUL', logo_url: '⚡', captain_name: 'Samar "Vortex" (C)', matches_played: 5, wins: 2, kills: 38, placement_points: 36, kill_points: 38, bonus_points: 0, total_points: 74, rank: 1 },
      { id: 102, tournament_id: 1, slot: 2, team_name: 'GodLike Esports', tag: 'GODL', logo_url: '👑', captain_name: 'Jonathan "JONNY" (C)', matches_played: 5, wins: 1, kills: 42, placement_points: 28, kill_points: 42, bonus_points: 0, total_points: 70, rank: 2 },
      { id: 103, tournament_id: 1, slot: 3, team_name: 'Team XSpark', tag: 'TX', logo_url: '🔥', captain_name: 'ScoutOP "Tanmay" (C)', matches_played: 5, wins: 1, kills: 35, placement_points: 25, kill_points: 35, bonus_points: 0, total_points: 60, rank: 3 },
      { id: 104, tournament_id: 1, slot: 4, team_name: 'Entity Gaming', tag: 'ENT', logo_url: '🛡️', captain_name: 'Saumraj "Leader" (C)', matches_played: 5, wins: 1, kills: 31, placement_points: 24, kill_points: 31, bonus_points: 0, total_points: 55, rank: 4 },
      { id: 105, tournament_id: 1, slot: 5, team_name: 'Blind Esports', tag: 'BLND', logo_url: '👁️', captain_name: 'ManyaOP (C)', matches_played: 5, wins: 0, kills: 34, placement_points: 20, kill_points: 34, bonus_points: 0, total_points: 54, rank: 5 },
      { id: 106, tournament_id: 1, slot: 6, team_name: 'Revenant Esports', tag: 'RNT', logo_url: '🦅', captain_name: 'Sensei "Deepak" (C)', matches_played: 5, wins: 0, kills: 29, placement_points: 19, kill_points: 29, bonus_points: 0, total_points: 48, rank: 6 },
      { id: 107, tournament_id: 1, slot: 7, team_name: 'Orangutan Gaming', tag: 'OG', logo_url: '🦧', captain_name: 'Ash "Aashish" (C)', matches_played: 5, wins: 0, kills: 26, placement_points: 16, kill_points: 26, bonus_points: 0, total_points: 42, rank: 7 },
      { id: 108, tournament_id: 1, slot: 8, team_name: 'Gladiators Esports', tag: 'GLAD', logo_url: '⚔️', captain_name: 'Destro (C)', matches_played: 5, wins: 0, kills: 24, placement_points: 15, kill_points: 24, bonus_points: 0, total_points: 39, rank: 8 },
      { id: 109, tournament_id: 1, slot: 9, team_name: 'Global Esports', tag: 'GE', logo_url: '🌐', captain_name: 'Mavi "Harmandeep" (C)', matches_played: 5, wins: 0, kills: 22, placement_points: 12, kill_points: 22, bonus_points: 0, total_points: 34, rank: 9 },
      { id: 110, tournament_id: 1, slot: 10, team_name: 'Medal Esports', tag: 'MEDL', logo_url: '🏅', captain_name: 'Paradox (C)', matches_played: 5, wins: 0, kills: 20, placement_points: 11, kill_points: 20, bonus_points: 0, total_points: 31, rank: 10 },
      { id: 111, tournament_id: 1, slot: 11, team_name: 'Hyderabad Hydras', tag: 'HH', logo_url: '🐍', captain_name: 'Carry "Akash" (C)', matches_played: 5, wins: 0, kills: 18, placement_points: 10, kill_points: 18, bonus_points: 0, total_points: 28, rank: 11 },
      { id: 112, tournament_id: 1, slot: 12, team_name: 'Team Insane', tag: 'INS', logo_url: '🧠', captain_name: 'Aadi (C)', matches_played: 5, wins: 0, kills: 16, placement_points: 8, kill_points: 16, bonus_points: 0, total_points: 24, rank: 12 },
      { id: 113, tournament_id: 1, slot: 13, team_name: 'Gujarat Tigers', tag: 'GT', logo_url: '🐅', captain_name: 'Shadow (C)', matches_played: 5, wins: 0, kills: 15, placement_points: 6, kill_points: 15, bonus_points: 0, total_points: 21, rank: 13 },
      { id: 114, tournament_id: 1, slot: 14, team_name: 'Big Brother Esports', tag: 'BB', logo_url: '🤝', captain_name: 'Uzair (C)', matches_played: 5, wins: 0, kills: 14, placement_points: 4, kill_points: 14, bonus_points: 0, total_points: 18, rank: 14 },
      { id: 115, tournament_id: 1, slot: 15, team_name: 'Team 8Bit', tag: '8BIT', logo_url: '👾', captain_name: 'Juicy (C)', matches_played: 5, wins: 0, kills: 11, placement_points: 3, kill_points: 11, bonus_points: 0, total_points: 14, rank: 15 },
      { id: 116, tournament_id: 1, slot: 16, team_name: 'Autobotz Esports', tag: 'AUTO', logo_url: '🤖', captain_name: 'Cyber (C)', matches_played: 5, wins: 0, kills: 9, placement_points: 2, kill_points: 9, bonus_points: 0, total_points: 11, rank: 16 },

      // Free Fire MAX Teams (Tournament 2)
      { id: 201, tournament_id: 2, slot: 1, team_name: 'Total Gaming Esports', tag: 'TG', logo_url: '🐅', captain_name: 'Ajay "Ajjubhai" (C)', matches_played: 5, wins: 2, kills: 36, placement_points: 42, kill_points: 36, bonus_points: 0, total_points: 78, rank: 1 },
      { id: 202, tournament_id: 2, slot: 2, team_name: 'Team Elite (Blind FF)', tag: 'ELITE', logo_url: '⚡', captain_name: 'KillerFF (C)', matches_played: 5, wins: 1, kills: 38, placement_points: 34, kill_points: 38, bonus_points: 0, total_points: 72, rank: 2 },
      { id: 203, tournament_id: 2, slot: 3, team_name: 'Desi Gamers Esports', tag: 'DG', logo_url: '🔥', captain_name: 'Amitbhai (C)', matches_played: 5, wins: 1, kills: 32, placement_points: 31, kill_points: 32, bonus_points: 0, total_points: 63, rank: 3 },
      { id: 204, tournament_id: 2, slot: 4, team_name: 'Orangutan Elite', tag: 'OGE', logo_url: '🦧', captain_name: 'DevAlone (C)', matches_played: 5, wins: 1, kills: 28, placement_points: 29, kill_points: 28, bonus_points: 0, total_points: 57, rank: 4 },
      { id: 205, tournament_id: 2, slot: 5, team_name: 'Chemin Esports', tag: 'CHMN', logo_url: '🦅', captain_name: 'Swastik (C)', matches_played: 5, wins: 0, kills: 27, placement_points: 24, kill_points: 27, bonus_points: 0, total_points: 51, rank: 5 },
      { id: 206, tournament_id: 2, slot: 6, team_name: 'Nigma Galaxy FF', tag: 'NG', logo_url: '🌌', captain_name: 'VasiyoCRJ7 (C)', matches_played: 5, wins: 0, kills: 25, placement_points: 21, kill_points: 25, bonus_points: 0, total_points: 46, rank: 6 },
      { id: 207, tournament_id: 2, slot: 7, team_name: 'GodLike Free Fire', tag: 'GDLK', logo_url: '👑', captain_name: 'Niku (C)', matches_played: 5, wins: 0, kills: 22, placement_points: 18, kill_points: 22, bonus_points: 0, total_points: 40, rank: 7 },
      { id: 208, tournament_id: 2, slot: 8, team_name: 'TSM FTX Free Fire', tag: 'TSM', logo_url: '🎯', captain_name: 'OldMonk (C)', matches_played: 5, wins: 0, kills: 19, placement_points: 17, kill_points: 19, bonus_points: 0, total_points: 36, rank: 8 },
      { id: 209, tournament_id: 2, slot: 9, team_name: 'PVS Gaming Esports', tag: 'PVS', logo_url: '🛡️', captain_name: 'Hari "PVS" (C)', matches_played: 5, wins: 0, kills: 18, placement_points: 14, kill_points: 18, bonus_points: 0, total_points: 32, rank: 9 },
      { id: 210, tournament_id: 2, slot: 10, team_name: 'Black Flag Army', tag: 'BFA', logo_url: '🏴', captain_name: 'Aawara (C)', matches_played: 5, wins: 0, kills: 15, placement_points: 12, kill_points: 15, bonus_points: 0, total_points: 27, rank: 10 },
      { id: 211, tournament_id: 2, slot: 11, team_name: 'Team Mayhem', tag: 'MYHM', logo_url: '💥', captain_name: 'Lethal (C)', matches_played: 5, wins: 0, kills: 12, placement_points: 9, kill_points: 12, bonus_points: 0, total_points: 21, rank: 11 },
      { id: 212, tournament_id: 2, slot: 12, team_name: 'Galaxy Racer FF', tag: 'GXR', logo_url: '🏎️', captain_name: 'Speedy (C)', matches_played: 5, wins: 0, kills: 10, placement_points: 6, kill_points: 10, bonus_points: 0, total_points: 16, rank: 12 }
    ];

    state.esports_matches = [
      // BGMI Matches
      {
        id: 1001,
        tournament_id: 1,
        match_title: 'Match 1 · Erangel Launch',
        match_number: 1,
        map_name: 'Erangel',
        played_at: '2026-09-24 16:30',
        mvp_player: 'SOUL_Manya (7 Kills)',
        results: [
          { team_id: 101, team_name: 'Soul Esports', placement: 1, kills: 12, points: 22 },
          { team_id: 102, team_name: 'GodLike Esports', placement: 2, kills: 9, points: 15 },
          { team_id: 103, team_name: 'Team XSpark', placement: 3, kills: 7, points: 12 },
          { team_id: 104, team_name: 'Entity Gaming', placement: 4, kills: 6, points: 10 },
          { team_id: 105, team_name: 'Blind Esports', placement: 5, kills: 8, points: 11 }
        ]
      },
      {
        id: 1002,
        tournament_id: 1,
        match_title: 'Match 2 · Miramar Ridge Storm',
        match_number: 2,
        map_name: 'Miramar',
        played_at: '2026-09-24 17:30',
        mvp_player: 'GODL_Jonathan (9 Kills)',
        results: [
          { team_id: 102, team_name: 'GodLike Esports', placement: 1, kills: 14, points: 24 },
          { team_id: 101, team_name: 'Soul Esports', placement: 2, kills: 8, points: 14 },
          { team_id: 104, team_name: 'Entity Gaming', placement: 3, kills: 7, points: 12 },
          { team_id: 103, team_name: 'Team XSpark', placement: 4, kills: 6, points: 10 }
        ]
      },
      // Free Fire Matches
      {
        id: 2001,
        tournament_id: 2,
        match_title: 'Match 1 · Bermuda Clock Tower',
        match_number: 1,
        map_name: 'Bermuda',
        played_at: '2026-09-24 16:30',
        mvp_player: 'TG_FozyAjay (8 Kills)',
        results: [
          { team_id: 201, team_name: 'Total Gaming Esports', placement: 1, kills: 11, points: 23 },
          { team_id: 202, team_name: 'Team Elite (Blind FF)', placement: 2, kills: 9, points: 18 },
          { team_id: 203, team_name: 'Desi Gamers Esports', placement: 3, kills: 7, points: 15 },
          { team_id: 204, team_name: 'Orangutan Elite', placement: 4, kills: 6, points: 13 }
        ]
      },
      {
        id: 2002,
        tournament_id: 2,
        match_title: 'Match 2 · Purgatory Central',
        match_number: 2,
        map_name: 'Purgatory',
        played_at: '2026-09-24 17:30',
        mvp_player: 'ELITE_Killer (10 Kills)',
        results: [
          { team_id: 202, team_name: 'Team Elite (Blind FF)', placement: 1, kills: 12, points: 24 },
          { team_id: 201, team_name: 'Total Gaming Esports', placement: 2, kills: 8, points: 17 },
          { team_id: 203, team_name: 'Desi Gamers Esports', placement: 3, kills: 6, points: 14 }
        ]
      }
    ];
  }

  saveToDisk();
}

export default db;
