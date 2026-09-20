import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase } from './database.js';
import { getCloudStatus } from './cloudDb.js';

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

// Health check endpoint
app.get('/api/health', (req, res) => res.json({ 
  status: 'ok', 
  service: 'NextGen AR/VR API', 
  cloud: getCloudStatus(),
  time: new Date().toISOString() 
}));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/esports', esportsRoutes);
app.use('/api/cms', cmsRoutes);
app.use('/api/admin/export', exportRoutes);

// Direct browser download endpoint
app.get('/download/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const scratchDir = path.resolve(__dirname, '..', '..');
  const primaryPath = path.join(scratchDir, filename);
  const userDownloads = path.join('C:', 'Users', 'darsh', 'Downloads', filename);

  res.download(primaryPath, filename, (err) => {
    if (err) {
      res.download(userDownloads, filename, (err2) => {
        if (err2) res.status(404).json({ error: 'File not found' });
      });
    }
  });
});

// Serve frontend in production mode if dist exists in any common directory
const candidateDistDirs = [
  path.join(__dirname, 'dist'),
  path.join(__dirname, '..', 'dist'),
  path.join(process.cwd(), 'dist'),
  path.join(__dirname, 'public'),
  path.join(process.cwd(), 'public')
];

let resolvedDistDir = candidateDistDirs.find(d => fs.existsSync(path.join(d, 'index.html')));

if (resolvedDistDir) {
  console.log(`🌐 Serving full frontend website from: ${resolvedDistDir}`);
  app.use(express.static(resolvedDistDir));
}

app.get('*', (req, res, next) => {
  if (req.url.startsWith('/api')) return next();

  if (resolvedDistDir && fs.existsSync(path.join(resolvedDistDir, 'index.html'))) {
    return res.sendFile(path.join(resolvedDistDir, 'index.html'));
  }

  const cloudInfo = getCloudStatus();
  res.status(200).send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>NextGen AR/VR — Backend Cloud API</title>
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
          <div class="badge">● Cloud API Online & Active</div>
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

// Start Server (bind to 0.0.0.0 for cloud providers like Render, Railway, etc.)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`🚀 NextGen AR/VR Portal API Server running on port ${PORT}`);
  console.log(`🌐 Base URL: http://0.0.0.0:${PORT}`);
  console.log(`🔑 Admin Login: admin@nextgenarvr.club / Admin@NextGen2026!`);
  console.log(`======================================================\n`);
});
