import express from 'express';
import { db } from '../database.js';
import { authenticateAdmin, logAdminAction } from '../middleware/auth.js';

const router = express.Router();

// Helper to recalculate tournament standings, match points, and ranks based on active scoring rules
export function recalculateLeaderboard(tournamentId) {
  const tId = parseInt(tournamentId, 10);
  const tournament = db.get('esports_tournaments', t => t.id === tId);
  const rules = tournament?.scoring_rules || {
    placement_scale: { 1: 10, 2: 6, 3: 5, 4: 4, 5: 3, 6: 2, 7: 1, 8: 1 },
    kill_multiplier: 1,
    win_bonus: 0
  };

  const teams = db.all('esports_teams', t => t.tournament_id === tId);
  const matches = db.all('esports_matches', m => m.tournament_id === tId)
    .sort((a, b) => (a.match_number || 0) - (b.match_number || 0));

  // Initialize stats per team
  const teamStats = {};
  teams.forEach(t => {
    teamStats[t.id] = {
      matches_played: 0,
      wins: 0,
      kills: 0,
      placement_points: 0,
      kill_points: 0,
      bonus_points: t.bonus_points || 0,
      total_points: t.bonus_points || 0
    };
  });

  // Calculate points from all match results according to active rules
  matches.forEach(m => {
    if (Array.isArray(m.results)) {
      m.results.forEach(r => {
        const teamId = r.team_id;
        if (teamStats[teamId]) {
          const placement = parseInt(r.placement, 10);
          const kills = parseInt(r.kills, 10) || 0;
          const pScale = rules.placement_scale || {};
          const pPts = pScale[placement] !== undefined ? Number(pScale[placement]) : 0;
          const kPts = kills * (rules.kill_multiplier !== undefined ? Number(rules.kill_multiplier) : 1);
          const isWin = placement === 1;
          const winBonus = isWin ? Number(rules.win_bonus || 0) : 0;
          const matchTotal = pPts + kPts + winBonus;

          // Update match score in the match record
          r.points = matchTotal;

          teamStats[teamId].matches_played += 1;
          if (isWin) teamStats[teamId].wins += 1;
          teamStats[teamId].kills += kills;
          teamStats[teamId].placement_points += pPts;
          teamStats[teamId].kill_points += kPts;
          teamStats[teamId].total_points += matchTotal;
        }
      });
      db.update('esports_matches', match => match.id === m.id, { results: m.results });
    }
  });

  // Update team records
  teams.forEach(t => {
    const s = teamStats[t.id] || {};
    db.update('esports_teams', item => item.id === t.id, s);
  });

  // Sort teams: total_points DESC, then wins DESC, then placement_points DESC, then kills DESC
  const updatedTeams = db.all('esports_teams', t => t.tournament_id === tId);
  updatedTeams.sort((a, b) => {
    if (b.total_points !== a.total_points) return b.total_points - a.total_points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.placement_points !== a.placement_points) return b.placement_points - a.placement_points;
    return b.kills - a.kills;
  });

  // Assign ranks
  updatedTeams.forEach((team, index) => {
    db.update('esports_teams', t => t.id === team.id, { rank: index + 1 });
    team.rank = index + 1;
  });

  return updatedTeams;
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
      game_name: game ? game.name : (t.game_name || 'Esports Game'),
      game_slug: game ? game.slug : (t.game_slug || 'battle-royale'),
      team_count: teamCount
    };
  });

  // Sort matches newest first
  const recentMatches = [...matches].sort((a, b) => new Date(b.played_at || b.created_at || 0) - new Date(a.played_at || a.created_at || 0)).slice(0, 10);

  return res.json({
    games,
    tournaments: enrichedTournaments,
    recentMatches
  });
});

// GET /api/esports/tournaments/:id/leaderboard (Live standings + Warhead Matrix + Top Fraggers)
router.get('/tournaments/:id/leaderboard', (req, res) => {
  const tournamentId = parseInt(req.params.id, 10);
  const tournament = db.get('esports_tournaments', t => t.id === tournamentId);

  if (!tournament) {
    return res.status(404).json({ error: 'Tournament not found.' });
  }

  const game = db.get('esports_games', g => g.id === tournament.game_id);
  const teams = recalculateLeaderboard(tournamentId);
  const matches = db.all('esports_matches', m => m.tournament_id === tournamentId)
    .sort((a, b) => (a.match_number || 0) - (b.match_number || 0));

  // Compute PointCalc Warhead Matrix: points per match per team
  const warhead = teams.map(team => {
    const matchScores = matches.map(m => {
      const resRow = (m.results || []).find(r => r.team_id === team.id);
      return {
        match_id: m.id,
        match_number: m.match_number,
        map_name: m.map_name,
        placement: resRow ? resRow.placement : null,
        kills: resRow ? resRow.kills : 0,
        points: resRow ? resRow.points : 0,
        is_win: resRow ? resRow.placement === 1 : false
      };
    });
    return {
      team_id: team.id,
      team_name: team.team_name,
      tag: team.tag,
      rank: team.rank,
      total_points: team.total_points,
      wins: team.wins,
      matches: matchScores
    };
  });

  // Top 3 Podium
  const podium = {
    first: teams[0] || null,
    second: teams[1] || null,
    third: teams[2] || null
  };

  return res.json({
    tournament: {
      ...tournament,
      game_name: game ? game.name : tournament.game_name
    },
    podium,
    leaderboard: teams,
    matches,
    warhead
  });
});

// PUT /api/esports/tournaments/:id/scoring-rules (Admin customizes points system)
router.put('/tournaments/:id/scoring-rules', authenticateAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const tournament = db.get('esports_tournaments', t => t.id === id);

  if (!tournament) {
    return res.status(404).json({ error: 'Tournament not found.' });
  }

  const { placement_scale, kill_multiplier, win_bonus, system_name, win_title } = req.body;

  const currentRules = tournament.scoring_rules || {};
  const updatedRules = {
    ...currentRules,
    system_name: system_name || currentRules.system_name || 'Custom Points System',
    placement_scale: placement_scale || currentRules.placement_scale || {},
    kill_multiplier: kill_multiplier !== undefined ? parseFloat(kill_multiplier) : (currentRules.kill_multiplier ?? 1),
    win_bonus: win_bonus !== undefined ? parseFloat(win_bonus) : (currentRules.win_bonus ?? 0),
    win_title: win_title || currentRules.win_title || 'WINNER'
  };

  const updatedTournament = db.update('esports_tournaments', t => t.id === id, { scoring_rules: updatedRules });
  const updatedLeaderboard = recalculateLeaderboard(id);

  logAdminAction(req.admin.username, 'UPDATE_SCORING_RULES', {
    tournament_id: id,
    tournament_title: tournament.title,
    rules: updatedRules
  });

  return res.json({
    message: 'Points system updated and all match scores recalculated successfully!',
    tournament: updatedTournament,
    leaderboard: updatedLeaderboard
  });
});

// POST /api/esports/tournaments/:id/recalculate (Force recalculate leaderboard)
router.post('/tournaments/:id/recalculate', authenticateAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const tournament = db.get('esports_tournaments', t => t.id === id);

  if (!tournament) {
    return res.status(404).json({ error: 'Tournament not found.' });
  }

  const leaderboard = recalculateLeaderboard(id);
  return res.json({ message: 'Leaderboard recalculated successfully.', leaderboard });
});

// GET /api/esports/tournaments/:id/export.csv (Export points table as CSV)
router.get('/tournaments/:id/export.csv', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const tournament = db.get('esports_tournaments', t => t.id === id);
  const teams = recalculateLeaderboard(id);

  const winLabel = tournament?.game_name?.toLowerCase().includes('free fire') ? 'Booyahs' : 'WWCD';

  let csv = `\uFEFFRank,Team Name,Tag,Captain,Matches Played,${winLabel},Placement Points,Kill Points,Bonus Points,Total Points\r\n`;
  teams.forEach(t => {
    const sanitize = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
    csv += `${t.rank},${sanitize(t.team_name)},${sanitize(t.tag)},${sanitize(t.captain_name)},${t.matches_played || 0},${t.wins || 0},${t.placement_points || 0},${t.kill_points || 0},${t.bonus_points || 0},${t.total_points || 0}\r\n`;
  });

  const safeTitle = (tournament?.title || 'esports_standings').replace(/[^a-zA-Z0-9]/g, '_');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}_points_table.csv"`);
  return res.send(csv);
});

// POST /api/esports/calculate (PointCalc Interactive Formula Simulator)
router.post('/calculate', (req, res) => {
  const {
    game = 'bgmi',
    placement = 1,
    kills = 0,
    kill_multiplier = 1,
    win_bonus = 0,
    custom_placement_scale = null
  } = req.body;

  const numPlacement = parseInt(placement, 10) || 1;
  const numKills = parseInt(kills, 10) || 0;
  const kMult = parseFloat(kill_multiplier) || 1;
  const wBonus = parseFloat(win_bonus) || 0;

  // Default placement scales if not custom
  const defaultScale = game === 'freefire' 
    ? { 1: 12, 2: 9, 3: 8, 4: 7, 5: 6, 6: 5, 7: 4, 8: 3, 9: 2, 10: 1, 11: 0, 12: 0 }
    : { 1: 10, 2: 6, 3: 5, 4: 4, 5: 3, 6: 2, 7: 1, 8: 1, 9: 0, 10: 0, 11: 0, 12: 0, 13: 0, 14: 0, 15: 0, 16: 0 };

  const scale = custom_placement_scale || defaultScale;
  const placementPoints = scale[numPlacement] !== undefined ? scale[numPlacement] : 0;
  const killPoints = numKills * kMult;
  const isWin = numPlacement === 1;
  const bonusPoints = isWin ? wBonus : 0;
  const total = placementPoints + killPoints + bonusPoints;

  const winLabel = game === 'freefire' ? 'Booyah! 🔥' : 'WWCD! 🍗';
  const formula = `[Placement: Rank #${numPlacement} = ${placementPoints} Pts] + [${numKills} Kills × ${kMult} = ${killPoints} Kill Pts]${bonusPoints > 0 ? ` + [Win Bonus = ${bonusPoints} Pts]` : ''} = ${total} Total Points`;

  return res.json({
    game,
    placement: numPlacement,
    kills: numKills,
    placement_points: placementPoints,
    kill_points: killPoints,
    bonus_points: bonusPoints,
    total_points: total,
    is_win: isWin,
    win_label: winLabel,
    formula
  });
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
    placement_scale: { 1: 10, 2: 6, 3: 5, 4: 4, 5: 3, 6: 2, 7: 1, 8: 1 },
    kill_multiplier: 1,
    win_bonus: 0
  };

  const processedResults = [];

  for (const item of results) {
    const teamId = parseInt(item.team_id, 10);
    const placement = parseInt(item.placement, 10);
    const kills = parseInt(item.kills, 10) || 0;

    const pScale = rules.placement_scale || {};
    const placementPts = pScale[placement] !== undefined ? Number(pScale[placement]) : 0;
    const killPts = kills * (rules.kill_multiplier !== undefined ? Number(rules.kill_multiplier) : 1);
    const winBonus = placement === 1 ? Number(rules.win_bonus || 0) : 0;
    const matchTotalPoints = placementPts + killPts + winBonus;

    const team = db.get('esports_teams', t => t.id === teamId);
    processedResults.push({
      team_id: teamId,
      team_name: team ? team.team_name : item.team_name,
      placement,
      kills,
      points: matchTotalPoints
    });
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

  // Recalculate standings immediately
  const updatedLeaderboard = recalculateLeaderboard(tId);

  logAdminAction(req.admin.username, 'RECORD_MATCH_RESULT', { tournament_id: tId, match_id: match.id });

  return res.status(201).json({
    message: 'Match recorded and leaderboard recalculated successfully!',
    match,
    leaderboard: updatedLeaderboard
  });
});

// POST /api/esports/teams (Register / Add Team to tournament)
router.post('/teams', authenticateAdmin, (req, res) => {
  const { tournament_id, team_name, tag, logo_url, captain_name, captain_contact, members, slot } = req.body;

  if (!tournament_id || !team_name || !captain_name) {
    return res.status(400).json({ error: 'Tournament, team name, and captain name are required.' });
  }

  const tId = parseInt(tournament_id, 10);
  const currentCount = db.count('esports_teams', t => t.tournament_id === tId);

  const team = db.insert('esports_teams', {
    tournament_id: tId,
    slot: parseInt(slot, 10) || (currentCount + 1),
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
    rank: currentCount + 1
  });

  recalculateLeaderboard(tId);
  logAdminAction(req.admin.username, 'ADD_ESPORTS_TEAM', { tournament_id: tId, team_name });

  return res.status(201).json({ message: 'Team registered successfully', team });
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

// DELETE /api/esports/matches/:id (Delete a match and recalculate standings)
router.delete('/matches/:id', authenticateAdmin, (req, res) => {
  const matchId = parseInt(req.params.id, 10);
  const match = db.get('esports_matches', m => m.id === matchId);
  if (!match) {
    return res.status(404).json({ error: 'Match not found.' });
  }
  const tournId = match.tournament_id;
  db.delete('esports_matches', m => m.id === matchId);
  const updatedLeaderboard = recalculateLeaderboard(tournId);
  logAdminAction(req.admin.username, 'DELETE_MATCH', { match_id: matchId, tournament_id: tournId });
  return res.json({ message: 'Match deleted and leaderboard recalculated.', leaderboard: updatedLeaderboard });
});

export default router;
