import express from 'express';
import { db } from '../database.js';
import { authenticateAdmin, logAdminAction } from '../middleware/auth.js';

const router = express.Router();

// Helper to recalculate tournament standings & ranks
function recalculateLeaderboard(tournamentId) {
  const teams = db.all('esports_teams', t => t.tournament_id === tournamentId);

  // Sort teams: highest total_points first, then highest wins, then highest kills
  teams.sort((a, b) => {
    if (b.total_points !== a.total_points) return b.total_points - a.total_points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.kills - a.kills;
  });

  // Assign updated ranks
  teams.forEach((team, index) => {
    db.update('esports_teams', t => t.id === team.id, { rank: index + 1 });
  });

  return teams;
}

// GET /api/esports/overview (Games, active tournaments, recent matches)
router.get('/overview', (req, res) => {
  const games = db.all('esports_games');
  const tournaments = db.all('esports_tournaments');
  const matches = db.all('esports_matches');

  // Enrich tournaments with game names and team counts
  const enrichedTournaments = tournaments.map(t => {
    const game = games.find(g => g.id === t.game_id);
    const teamCount = db.count('esports_teams', team => team.tournament_id === t.id);
    return {
      ...t,
      game_name: game ? game.name : 'Esports Game',
      game_slug: game ? game.slug : 'general',
      team_count: teamCount
    };
  });

  // Sort matches newest first
  const recentMatches = [...matches].sort((a, b) => new Date(b.played_at || b.created_at) - new Date(a.played_at || a.created_at)).slice(0, 5);

  return res.json({
    games,
    tournaments: enrichedTournaments,
    recentMatches
  });
});

// GET /api/esports/tournaments/:id/leaderboard (Live standings)
router.get('/tournaments/:id/leaderboard', (req, res) => {
  const tournamentId = parseInt(req.params.id, 10);
  const tournament = db.get('esports_tournaments', t => t.id === tournamentId);

  if (!tournament) {
    return res.status(404).json({ error: 'Tournament not found.' });
  }

  const game = db.get('esports_games', g => g.id === tournament.game_id);
  const teams = recalculateLeaderboard(tournamentId);
  const matches = db.all('esports_matches', m => m.tournament_id === tournamentId)
    .sort((a, b) => (b.match_number || 0) - (a.match_number || 0));

  // Top 3 Podium
  const podium = {
    first: teams[0] || null,
    second: teams[1] || null,
    third: teams[2] || null
  };

  return res.json({
    tournament: {
      ...tournament,
      game_name: game ? game.name : 'Esports Game'
    },
    podium,
    leaderboard: teams,
    matches
  });
});

// POST /api/esports/calculate (Interactive Points Calculator / Simulator)
router.post('/calculate', (req, res) => {
  const {
    scoring_type = 'battle_royale',
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
  let bonusPoints = (is_win || numPlacement === 1) ? wBonus : 0;
  let breakdown = {};

  if (scoring_type === 'battle_royale') {
    const scale = custom_placement_scale || {
      1: 15, 2: 12, 3: 10, 4: 8, 5: 6, 6: 4, 7: 2, 8: 1, 9: 1, 10: 1
    };
    placementPoints = scale[numPlacement] !== undefined ? scale[numPlacement] : 0;

    const total = placementPoints + killPoints + bonusPoints;
    breakdown = {
      formula: `(Placement Pts: ${placementPoints}) + (${numKills} Kills × ${kMult} = ${killPoints} Kill Pts) + (Winner Bonus: ${bonusPoints})`,
      placement_points: placementPoints,
      kill_points: killPoints,
      bonus_points: bonusPoints,
      total_points: total
    };
  } else if (scoring_type === 'match_win') {
    const winPts = is_win ? 3 : 0;
    const total = winPts + killPoints + bonusPoints;
    breakdown = {
      formula: `(Match Result: ${winPts} Pts) + (${numKills} Frags × ${kMult} = ${killPoints} Kill Pts) + (Bonus: ${bonusPoints})`,
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

// POST /api/esports/tournaments (Admin create tournament)
router.post('/tournaments', authenticateAdmin, (req, res) => {
  const { title, game_id, prize_pool, status, start_date, end_date, venue, banner_url, registration_open, scoring_rules, description } = req.body;

  if (!title || !game_id) {
    return res.status(400).json({ error: 'Tournament title and game selection are required.' });
  }

  const game = db.get('esports_games', g => g.id === parseInt(game_id, 10));
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString().slice(-4);

  const defaultRules = game ? game.default_rules : {
    placement_scale: { 1: 15, 2: 12, 3: 10, 4: 8, 5: 6, 6: 4, 7: 2, 8: 1, 9: 1, 10: 1 },
    kill_multiplier: 1,
    win_bonus: 5
  };

  const tournament = db.insert('esports_tournaments', {
    title: title.trim(),
    slug,
    game_id: parseInt(game_id, 10),
    game_name: game ? game.name : 'Esports Game',
    prize_pool: prize_pool || 'TBD',
    status: status || 'upcoming',
    start_date: start_date || new Date().toISOString().split('T')[0],
    end_date: end_date || '',
    venue: venue || 'NextGen Esports Arena & Discord',
    banner_url: banner_url || (game ? game.banner_url : ''),
    registration_open: registration_open !== undefined ? (registration_open ? 1 : 0) : 1,
    scoring_rules: scoring_rules || defaultRules,
    description: description ? description.trim() : ''
  });

  logAdminAction(req.admin.username, 'CREATE_TOURNAMENT', { tournament_id: tournament.id, title });

  return res.status(201).json({ message: 'Tournament created successfully', tournament });
});

// PUT /api/esports/tournaments/:id (Admin edit tournament)
router.put('/tournaments/:id', authenticateAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = db.get('esports_tournaments', t => t.id === id);

  if (!existing) {
    return res.status(404).json({ error: 'Tournament not found.' });
  }

  const updated = db.update('esports_tournaments', t => t.id === id, req.body);
  logAdminAction(req.admin.username, 'EDIT_TOURNAMENT', { tournament_id: id, title: updated.title });

  return res.json({ message: 'Tournament updated successfully', tournament: updated });
});

// POST /api/esports/teams (Register / Add Team to tournament)
router.post('/teams', authenticateAdmin, (req, res) => {
  const { tournament_id, team_name, tag, logo_url, captain_name, captain_contact, members } = req.body;

  if (!tournament_id || !team_name || !captain_name) {
    return res.status(400).json({ error: 'Tournament, team name, and captain name are required.' });
  }

  const team = db.insert('esports_teams', {
    tournament_id: parseInt(tournament_id, 10),
    team_name: team_name.trim(),
    tag: tag ? tag.trim().toUpperCase() : team_name.slice(0, 3).toUpperCase(),
    logo_url: logo_url || '🎮',
    captain_name: captain_name.trim(),
    captain_contact: captain_contact || '',
    members: Array.isArray(members) ? members : (members ? String(members).split(',').map(m => m.trim()) : [captain_name]),
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
  logAdminAction(req.admin.username, 'ADD_ESPORTS_TEAM', { tournament_id, team_name });

  return res.status(201).json({ message: 'Team registered successfully', team });
});

// POST /api/esports/matches (Admin record match results & auto-calculate points)
router.post('/matches', authenticateAdmin, (req, res) => {
  const { tournament_id, match_title, match_number, map_name, played_at, mvp_player, results } = req.body;

  const tId = parseInt(tournament_id, 10);
  const tournament = db.get('esports_tournaments', t => t.id === tId);
  if (!tournament) {
    return res.status(404).json({ error: 'Tournament not found.' });
  }

  if (!results || !Array.isArray(results) || results.length === 0) {
    return res.status(400).json({ error: 'Match results array is required.' });
  }

  const rules = tournament.scoring_rules || {
    placement_scale: { 1: 15, 2: 12, 3: 10, 4: 8, 5: 6, 6: 4, 7: 2, 8: 1, 9: 1, 10: 1 },
    kill_multiplier: 1,
    win_bonus: 5
  };

  const processedResults = [];

  // Update each participating team
  for (const item of results) {
    const teamId = parseInt(item.team_id, 10);
    const placement = parseInt(item.placement, 10);
    const kills = parseInt(item.kills, 10) || 0;

    const placementPts = (rules.placement_scale && rules.placement_scale[placement]) || 0;
    const killPts = kills * (rules.kill_multiplier || 1);
    const winBonus = placement === 1 ? (rules.win_bonus || 0) : 0;
    const matchTotalPoints = placementPts + killPts + winBonus;

    const team = db.get('esports_teams', t => t.id === teamId);
    if (team) {
      db.update('esports_teams', t => t.id === teamId, {
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

  // Insert match record
  const match = db.insert('esports_matches', {
    tournament_id: tId,
    match_title: match_title || `Match #${match_number || 1}`,
    match_number: parseInt(match_number, 10) || 1,
    map_name: map_name || 'Standard Map',
    played_at: played_at || new Date().toISOString().replace('T', ' ').slice(0, 16),
    mvp_player: mvp_player || '',
    results: processedResults
  });

  // Recalculate standings
  const updatedLeaderboard = recalculateLeaderboard(tId);

  logAdminAction(req.admin.username, 'RECORD_MATCH_RESULT', { tournament_id: tId, match_id: match.id });

  return res.status(201).json({
    message: 'Match recorded and leaderboard recalculated successfully!',
    match,
    leaderboard: updatedLeaderboard
  });
});

// PUT /api/esports/teams/:id/adjust-points (Admin manual points adjustment)
router.put('/teams/:id/adjust-points', authenticateAdmin, (req, res) => {
  const teamId = parseInt(req.params.id, 10);
  const { total_points_override, bonus_points_adjustment, reason } = req.body;

  const team = db.get('esports_teams', t => t.id === teamId);
  if (!team) {
    return res.status(404).json({ error: 'Team not found.' });
  }

  let newTotal = team.total_points;
  let newBonus = team.bonus_points || 0;

  if (total_points_override !== undefined) {
    newTotal = parseInt(total_points_override, 10);
  } else if (bonus_points_adjustment !== undefined) {
    const adj = parseInt(bonus_points_adjustment, 10) || 0;
    newBonus += adj;
    newTotal += adj;
  }

  const updated = db.update('esports_teams', t => t.id === teamId, {
    total_points: newTotal,
    bonus_points: newBonus
  });

  recalculateLeaderboard(team.tournament_id);
  logAdminAction(req.admin.username, 'ADJUST_TEAM_POINTS', { team_id: teamId, team_name: team.team_name, newTotal, reason });

  return res.json({ message: 'Team points adjusted successfully', team: updated });
});

export default router;
