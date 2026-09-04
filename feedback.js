import express from 'express';
import { db } from '../database.js';
import { authenticateAdmin } from '../middleware/auth.js';

const router = express.Router();

// POST /api/feedback (Public submission)
router.post('/', (req, res) => {
  const { event_id, event_title, rating_content, rating_organization, rating_speaker, what_liked, what_improve, comments, author_name, author_email } = req.body;

  const rContent = parseInt(rating_content, 10);
  const rOrg = parseInt(rating_organization, 10);
  const rSpeaker = parseInt(rating_speaker, 10);

  if (!rContent || !rOrg || !rSpeaker || rContent < 1 || rContent > 5 || rOrg < 1 || rOrg > 5 || rSpeaker < 1 || rSpeaker > 5) {
    return res.status(400).json({ error: 'Please provide valid 1-5 star ratings for all categories.' });
  }

  let finalTitle = event_title || 'General Club Feedback';
  if (event_id) {
    const event = db.get('events', e => e.id === parseInt(event_id, 10));
    if (event) finalTitle = event.title;
  }

  const feedback = db.insert('feedback', {
    event_id: event_id ? parseInt(event_id, 10) : null,
    event_title: finalTitle,
    rating_content: rContent,
    rating_organization: rOrg,
    rating_speaker: rSpeaker,
    what_liked: what_liked ? what_liked.trim() : '',
    what_improve: what_improve ? what_improve.trim() : '',
    comments: comments ? comments.trim() : '',
    author_name: author_name ? author_name.trim() : 'Anonymous Member',
    author_email: author_email ? author_email.trim().toLowerCase() : '',
    submitted_at: new Date().toISOString()
  });

  return res.status(201).json({
    message: 'Thank you for your valuable feedback! Your response has been recorded.',
    feedback_id: feedback.id
  });
});

// GET /api/feedback (Admin view with aggregated analytics)
router.get('/', authenticateAdmin, (req, res) => {
  const { event_id } = req.query;

  let feedbackList = db.all('feedback', f => {
    if (event_id && event_id !== 'all') {
      return f.event_id === parseInt(event_id, 10);
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
      sumContent += f.rating_content;
      sumOrg += f.rating_organization;
      sumSpeaker += f.rating_speaker;

      const itemAvg = Math.round((f.rating_content + f.rating_organization + f.rating_speaker) / 3);
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

export default router;
