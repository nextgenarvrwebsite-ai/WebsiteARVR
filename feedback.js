import express from 'express';
import { db } from '../database.js';
import { authenticateAdmin } from '../middleware/auth.js';

const router = express.Router();

function normalizeFeedbackRecord(item) {
  const answers = item.answers || {};
  const author_name = (item.participant_name || item.author_name || item.name || 'Anonymous Student').trim();
  const register_no = (item.register_no || item.roll_no || '').trim().toUpperCase();
  const author_email = (item.email || item.author_email || item.mail_id || '').trim().toLowerCase();
  const department = (item.department || item.branch || '').trim();

  // Extract ratings: support direct ratings or questionnaire answer keys (q1, q2, etc.)
  let rContent = parseInt(item.rating_content, 10);
  if (isNaN(rContent) || rContent < 1 || rContent > 5) {
    if (typeof answers.q1 === 'number') rContent = answers.q1;
    else if (typeof answers.q1 === 'string' && !isNaN(parseInt(answers.q1, 10))) rContent = parseInt(answers.q1, 10);
    else rContent = 5;
  }

  let rOrg = parseInt(item.rating_organization, 10);
  if (isNaN(rOrg) || rOrg < 1 || rOrg > 5) {
    if (typeof answers.q2 === 'number') rOrg = answers.q2;
    else if (typeof answers.q2 === 'string' && !isNaN(parseInt(answers.q2, 10))) rOrg = parseInt(answers.q2, 10);
    else rOrg = 5;
  }

  let rSpeaker = parseInt(item.rating_speaker, 10);
  if (isNaN(rSpeaker) || rSpeaker < 1 || rSpeaker > 5) {
    rSpeaker = 5;
  }

  const what_liked = (item.what_liked || (answers.q3 ? String(answers.q3) : '')).trim();
  const what_improve = (item.what_improve || (answers.q4 ? String(answers.q4) : '')).trim();
  const comments = (item.comments || (answers.q5 ? String(answers.q5) : '')).trim();

  let finalTitle = item.event_title || 'General NextGen Club Feedback';
  const rawEventId = item.event_id || 'general';
  if (rawEventId && String(rawEventId) !== 'general') {
    const event = db.get('events', e => String(e.id) === String(rawEventId));
    if (event && event.title) finalTitle = event.title;
  }

  return {
    id: item.id || Date.now() + Math.floor(Math.random() * 1000),
    event_id: String(rawEventId),
    event_title: finalTitle,
    participant_name: author_name,
    register_no,
    email: author_email,
    department,
    author_name,
    author_email,
    rating_content: rContent,
    rating_organization: rOrg,
    rating_speaker: rSpeaker,
    what_liked,
    what_improve,
    comments,
    answers,
    submitted_at: item.submitted_at || item.created_at || new Date().toISOString()
  };
}

// POST /api/feedback (Public submission)
router.post('/', (req, res) => {
  const normalized = normalizeFeedbackRecord(req.body);

  const feedback = db.insert('feedback', normalized);

  return res.status(201).json({
    message: 'Thank you for your valuable feedback! Your response has been recorded.',
    feedback_id: feedback.id,
    feedback
  });
});

// POST /api/feedback/batch or POST /api/feedback/sync (Batch synchronization from browser localStorage)
function handleBatchSync(req, res) {
  const list = req.body.feedbacks || req.body.feedback;
  if (!Array.isArray(list)) {
    return res.status(400).json({ error: 'Expected an array of feedbacks.' });
  }

  let syncedCount = 0;
  const existingAll = db.all('feedback');

  list.forEach(item => {
    if (!item) return;
    const normalized = normalizeFeedbackRecord(item);

    // Prevent duplicates by checking ID or register_no + event_id + submitted_at
    const exists = existingAll.some(ex => 
      String(ex.id) === String(normalized.id) ||
      (normalized.register_no && String(ex.event_id) === String(normalized.event_id) && String(ex.register_no).toUpperCase() === normalized.register_no)
    );

    if (!exists) {
      db.insert('feedback', normalized);
      existingAll.push(normalized);
      syncedCount++;
    }
  });

  return res.json({
    success: true,
    synced: syncedCount,
    total: db.count('feedback'),
    feedbacks: db.all('feedback')
  });
}

router.post('/sync', handleBatchSync);
router.post('/batch', handleBatchSync);

// GET /api/feedback/all (Public / Admin sync endpoint to pull all feedbacks)
router.get('/all', (req, res) => {
  const all = db.all('feedback');
  all.sort((a, b) => new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0));
  return res.json({ success: true, count: all.length, feedbacks: all });
});

// GET /api/feedback (Admin view with aggregated analytics)
router.get('/', authenticateAdmin, (req, res) => {
  const { event_id } = req.query;

  let feedbackList = db.all('feedback', f => {
    if (event_id && event_id !== 'all') {
      return String(f.event_id) === String(event_id);
    }
    return true;
  });

  // Calculate aggregates
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
      const c = f.rating_content || 5;
      const o = f.rating_organization || 5;
      const s = f.rating_speaker || 5;

      sumContent += c;
      sumOrg += o;
      sumSpeaker += s;

      const itemAvg = Math.max(1, Math.min(5, Math.round((c + o + s) / 3)));
      if (distribution[itemAvg] !== undefined) {
        distribution[itemAvg]++;
      }
    }

    avgContent = Number((sumContent / total).toFixed(1));
    avgOrg = Number((sumOrg / total).toFixed(1));
    avgSpeaker = Number((sumSpeaker / total).toFixed(1));
    overallAvg = Number(((avgContent + avgOrg + avgSpeaker) / 3).toFixed(1));
  }

  // Sort newest first
  feedbackList.sort((a, b) => new Date(b.submitted_at || b.created_at || 0) - new Date(a.submitted_at || a.created_at || 0));

  return res.json({
    feedback: feedbackList,
    feedbacks: feedbackList,
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

export default router;
