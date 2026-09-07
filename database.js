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
        school: 'Alliance College of Engineering and Design (CED)',
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
        school: 'Alliance College of Engineering and Design (CED)',
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
        school: 'Alliance College of Engineering and Design (CED)',
        year: '3rd Year',
        domain: 'AR/VR & Spatial Innovation',
        role: 'President',
        email: 'president.nextgen@alliance.edu.in',
        phone: '',
        bio: 'President of NextGen (AR/VR) Reality Club (3rd Year, Information Technology). Leading spatial innovation, hardware initiatives, and immersive metaverse development at Alliance University.',
        avatar_url: '/src/assets/council/council_member_1.jpg',
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
        school: 'Alliance College of Engineering and Design (CED)',
        year: '3rd Year',
        domain: 'Executive Council & Technical Wings',
        role: 'Vice President',
        email: 'vp.nextgen@alliance.edu.in',
        phone: '',
        bio: 'Vice President of NextGen (AR/VR) Reality Club (3rd Year, Information Technology). Overseeing executive operations, technical domain workshops, and student community engagements.',
        avatar_url: '/src/assets/council/council_member_4.jpg',
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
        full_name: 'Puneeth N',
        roll_no: '',
        branch: 'Information Technology',
        school: 'Alliance College of Engineering and Design (CED)',
        year: '3rd Year',
        domain: 'Treasury & Resource Operations',
        role: 'Treasurer',
        email: 'treasurer.nextgen@alliance.edu.in',
        phone: '',
        bio: 'Council Member & Treasurer of NextGen (AR/VR) Reality Club (3rd Year, Information Technology). Managing club budget allocations, sponsorships, financial operations, and resources.',
        avatar_url: '/src/assets/council/council_member_3.jpg',
        github_url: '',
        linkedin_url: '',
        portfolio_url: '',
        status: 'core_team',
        is_council: true,
        badge: 'TREASURER',
        joined_at: '2023-09-01'
      },
      {
        id: 6,
        full_name: 'Panchaksharayya',
        roll_no: '',
        branch: 'Information Technology',
        school: 'Alliance College of Engineering and Design (CED)',
        year: '3rd Year',
        domain: 'Media, PR & Documentation',
        role: 'Media and Documentation Coordinator',
        email: 'media.nextgen@alliance.edu.in',
        phone: '',
        bio: 'Council Member & Media and Documentation Coordinator (3rd Year, Information Technology). Managing documentation, institutional reporting, media production, and digital archives.',
        avatar_url: '/src/assets/council/council_member_2.jpg',
        github_url: '',
        linkedin_url: '',
        portfolio_url: '',
        status: 'core_team',
        is_council: true,
        badge: 'MEDIA & DOCS',
        joined_at: '2023-09-10'
      },
      {
        id: 7,
        full_name: 'Koel Dutta',
        roll_no: '',
        branch: 'Information Technology',
        school: 'Alliance College of Engineering and Design (CED)',
        year: '3rd Year',
        domain: 'Student Operations & Community Lead',
        role: 'Executive Member Lead',
        email: 'executive.nextgen@alliance.edu.in',
        phone: '',
        bio: 'Council Member & Executive Member Lead (3rd Year, Information Technology). Directing student delegations, domain wings engagement, and internal club initiatives.',
        avatar_url: '/src/assets/council/council_member_5.jpg',
        github_url: '',
        linkedin_url: '',
        portfolio_url: '',
        status: 'core_team',
        is_council: true,
        badge: 'EXECUTIVE LEAD',
        joined_at: '2024-01-15'
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

  // 8. Seed E-Sports Games, Tournaments, Teams & Matches
  if (!state.esports_games || state.esports_games.length === 0) {
    state.esports_games = [
      {
        id: 1,
        name: 'Valorant',
        slug: 'valorant',
        icon: 'Crosshair',
        banner_url: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&q=80&w=800',
        format: '5v5 Tactical Shooter',
        scoring_type: 'match_win',
        default_rules: {
          match_win_points: 3,
          match_draw_points: 1,
          round_diff_multiplier: 0.1,
          ace_bonus: 1
        },
        description: 'First-person tactical hero shooter with precision gunplay and unique agent abilities.'
      },
      {
        id: 2,
        name: 'BGMI / Battle Royale League',
        slug: 'bgmi-battle-royale',
        icon: 'Target',
        banner_url: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?auto=format&fit=crop&q=80&w=800',
        format: 'Squad Battle Royale (16 Teams)',
        scoring_type: 'battle_royale',
        default_rules: {
          placement_points: {
            "1": 15, "2": 12, "3": 10, "4": 8, "5": 6,
            "6": 4, "7": 2, "8": 1, "9": 1, "10": 1,
            "11": 0, "12": 0, "13": 0, "14": 0, "15": 0, "16": 0
          },
          kill_point_multiplier: 1,
          winner_chicken_dinner_bonus: 5
        },
        description: 'High-stakes battle royale combat where strategic zone rotations and gunfights determine the champions.'
      },
      {
        id: 3,
        name: 'Rocket League 3v3',
        slug: 'rocket-league',
        icon: 'Zap',
        banner_url: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&q=80&w=800',
        format: '3v3 High-Octane Vehicular Soccer',
        scoring_type: 'match_win',
        default_rules: {
          series_win_points: 3,
          goal_diff_multiplier: 0.2,
          hat_trick_bonus: 1
        },
        description: 'Vehicular acrobatics meets soccer in hyper-fast airborne action.'
      }
    ];

    state.esports_tournaments = [
      {
        id: 1,
        title: 'NextGen Pro Apex League Season 4',
        slug: 'nextgen-pro-apex-season-4',
        game_id: 2,
        game_name: 'BGMI / Battle Royale League',
        prize_pool: '₹50,000 INR (~$600 USD)',
        status: 'live',
        start_date: '2026-08-15',
        end_date: '2026-09-10',
        venue: 'NextGen Esports Lab & Twitch',
        banner_url: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&q=80&w=800',
        registration_open: 1,
        scoring_rules: {
          placement_scale: {
            "1": 15, "2": 12, "3": 10, "4": 8, "5": 6,
            "6": 4, "7": 2, "8": 1, "9": 1, "10": 1
          },
          kill_multiplier: 1,
          win_bonus: 5
        },
        description: 'The premier college Battle Royale championship featuring 16 top squads battling across 6 rigorous map rotations.'
      }
    ];

    state.esports_teams = [
      {
        id: 1,
        tournament_id: 1,
        team_name: 'Vortex Phantom',
        tag: 'VP',
        logo_url: '⚡',
        captain_name: 'Samar "Vortex" Singh',
        captain_contact: 'samar.vp@gmail.com',
        members: ['Vortex', 'Krypton', 'ShadowStrike', 'Nova'],
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
        team_name: 'Cyber Valkyries',
        tag: 'CVK',
        logo_url: '🦅',
        captain_name: 'Rhea "Valkyrie" Sen',
        captain_contact: 'rhea.cvk@gmail.com',
        members: ['Valkyrie', 'PixelQueen', 'Athena', 'Siren'],
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
        team_name: 'HyperDrive Gaming',
        tag: 'HDG',
        logo_url: '🔥',
        captain_name: 'Aditya "Pulse" Rao',
        captain_contact: 'aditya.hdg@gmail.com',
        members: ['Pulse', 'Blaze', 'Glitch', 'Overclock'],
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
        team_name: 'Quantum Titans',
        tag: 'QTN',
        logo_url: '⚛️',
        captain_name: 'Farhan "Quark" Ali',
        captain_contact: 'farhan.qtn@gmail.com',
        members: ['Quark', 'Boson', 'Entropy', 'Proton'],
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
        team_name: 'Neon Strikers',
        tag: 'NST',
        logo_url: '🎯',
        captain_name: 'Kavya "Viper" Nair',
        captain_contact: 'kavya.nst@gmail.com',
        members: ['Viper', 'Echo', 'FrostByte', 'Zero'],
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
        team_name: 'Apex Predators',
        tag: 'APX',
        logo_url: '🐺',
        captain_name: 'Dev "Apex" Verma',
        captain_contact: 'dev.apx@gmail.com',
        members: ['Apex', 'Raptor', 'Fang', 'Ghost'],
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
        match_title: 'Match 1: Erangel Opening Clash',
        match_number: 1,
        map_name: 'Erangel',
        played_at: '2026-08-20 18:00',
        mvp_player: 'VP_Vortex (11 Kills)',
        results: [
          { team_id: 1, team_name: 'Vortex Phantom', placement: 1, kills: 14, points: 29 },
          { team_id: 2, team_name: 'Cyber Valkyries', placement: 2, kills: 8, points: 20 },
          { team_id: 3, team_name: 'HyperDrive Gaming', placement: 3, kills: 7, points: 17 }
        ]
      },
      {
        id: 2,
        tournament_id: 1,
        match_title: 'Match 2: Miramar High Desert',
        match_number: 2,
        map_name: 'Miramar',
        played_at: '2026-08-21 19:30',
        mvp_player: 'CVK_PixelQueen (9 Kills)',
        results: [
          { team_id: 2, team_name: 'Cyber Valkyries', placement: 1, kills: 12, points: 27 },
          { team_id: 4, team_name: 'Quantum Titans', placement: 2, kills: 9, points: 21 },
          { team_id: 1, team_name: 'Vortex Phantom', placement: 3, kills: 8, points: 18 }
        ]
      }
    ];
  }

  saveToDisk();
}

export default db;
