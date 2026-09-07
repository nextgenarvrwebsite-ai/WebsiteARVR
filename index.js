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

// Serve frontend in production mode if dist exists
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

app.get('*', (req, res, next) => {
  if (req.url.startsWith('/api')) return next();
  res.sendFile(path.join(distPath, 'index.html'), err => {
    if (err) {
      res.status(200).send(`
        <!DOCTYPE html>
        <html>
          <head><title>NextGen AR/VR API Server</title></head>
          <body style="background:#080B10;color:#00F0FF;font-family:sans-serif;padding:2rem;text-align:center;">
            <h1>NextGen AR/VR Backend API Server is Running on port ${PORT}</h1>
            <p style="color:#94A3B8;">Frontend dev server runs separately on port 5173 with proxy.</p>
          </body>
        </html>
      `);
    }
  });
});

// Start Server (bind to 0.0.0.0 for cloud providers like Render, Railway, etc.)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`🚀 NextGen AR/VR Portal API Server running on port ${PORT}`);
  console.log(`🌐 Base URL: http://0.0.0.0:${PORT}`);
  console.log(`🔑 Admin Login: admin@nextgenarvr.club / Admin@NextGen2026!`);
  console.log(`======================================================\n`);
});
