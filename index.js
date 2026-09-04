import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase } from './database.js';

// Route handlers
import authRoutes from './routes/auth.js';
import memberRoutes from './routes/members.js';
import applicationRoutes from './routes/applications.js';
import eventRoutes from './routes/events.js';
import feedbackRoutes from './routes/feedback.js';
import esportsRoutes from './routes/esports.js';
import cmsRoutes from './routes/cms.js';
import exportRoutes from './routes/export.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize DB schema & seed data
initDatabase();

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${req.method} ${req.url}`);
  next();
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/esports', esportsRoutes);
app.use('/api/cms', cmsRoutes);
app.use('/api/admin/export', exportRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    club: 'NextGen AR/VR Portal',
    version: '1.0.0'
  });
});

// Serve frontend in production mode if dist exists
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

app.get('/', (req, res) => {
  res.status(200).send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>NextGen AR/VR — Backend API Service</title>
        <style>
          body { background: #07090E; color: #F1F5F9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
          .card { background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(0, 240, 255, 0.25); border-radius: 16px; padding: 2.5rem; max-width: 580px; width: 100%; box-shadow: 0 20px 40px rgba(0,0,0,0.6); }
          h1 { color: #00F0FF; margin-top: 0; font-size: 1.6rem; }
          .badge { display: inline-block; background: rgba(0, 255, 157, 0.15); border: 1px solid #00FF9D; color: #00FF9D; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.85rem; font-weight: 600; margin-bottom: 1.25rem; }
          p { color: #94A3B8; line-height: 1.6; }
          ul { list-style: none; padding: 0; margin: 1.5rem 0; }
          li { padding: 0.5rem 0; border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: space-between; font-family: monospace; font-size: 0.9rem; }
          a { color: #00F0FF; text-decoration: none; }
          a:hover { text-decoration: underline; }
        </style>
      </head>
      <body>
        <div class="card">
          <span class="badge">● Online & Operational</span>
          <h1>NextGen AR/VR Portal API</h1>
          <p>The backend REST API server is actively running on Render. Ready to accept cross-origin requests from your Netlify frontend.</p>
          <ul>
            <li><span>Health Check:</span> <a href="/api/health" target="_blank">/api/health</a></li>
            <li><span>Events API:</span> <a href="/api/events" target="_blank">/api/events</a></li>
            <li><span>Members API:</span> <a href="/api/members" target="_blank">/api/members</a></li>
            <li><span>Esports Standings:</span> <a href="/api/esports/overview" target="_blank">/api/esports/overview</a></li>
          </ul>
          <p style="font-size: 0.8rem; color: #64748B; margin-top: 1.5rem;">CORS is enabled for all origins. Connect your frontend by setting your Netlify environment variable to this URL.</p>
        </div>
      </body>
    </html>
  `);
});

// Start Server (bind to 0.0.0.0 for cloud providers like Render, Railway, etc.)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`🚀 NextGen AR/VR Portal API Server running on port ${PORT}`);
  console.log(`🌐 Base URL: http://0.0.0.0:${PORT}`);
  console.log(`🔑 Admin Login: admin@nextgenarvr.club / Admin@NextGen2026!`);
  console.log(`======================================================\n`);
});
