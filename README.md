# 🚀 NextGen AR/VR — Standalone Backend API (Render Deployment)

This repository contains the standalone Express.js backend REST API and JSON relational database for the **NextGen AR/VR Portal**, optimized for 1-click deployment on **[Render](https://render.com)**.

---

## ⚡ 1-Click Deployment on Render

### Step 1: Create a New Web Service
1. Log in to your **[Render Dashboard](https://dashboard.render.com/)**.
2. Click **New +** → **Web Service**.
3. Connect your GitHub repository (or upload this backend folder).

### Step 2: Configure Build & Start Settings
Render will auto-detect Node.js. Confirm the following settings:
- **Runtime**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `node index.js`
- **Plan**: Free

### Step 3: Environment Variables (Optional)
Render automatically sets `PORT` (usually `10000`). You can optionally add:
- `JWT_SECRET`: Any random secure string (e.g. `NextGen_Secret_XR_2026_Key!`)
- `NODE_ENV`: `production`

Click **Create Web Service**. Within 60 seconds, your API will be live at `https://your-service-name.onrender.com`!

---

## 🔗 Live API Endpoints Available

- **Health Check**: `GET /api/health`
- **Events & Registration**: `GET /api/events`, `POST /api/events/:id/register`
- **Members Directory**: `GET /api/members`
- **Membership Applications**: `POST /api/applications`, `PUT /api/applications/:id/review`
- **E-Sports Tournament & Scoring**: `GET /api/esports/overview`, `POST /api/esports/calculate`, `POST /api/esports/matches`
- **Feedback Collection**: `GET /api/feedback`, `POST /api/feedback`
- **Site CMS & Config**: `GET /api/cms/settings`, `GET /api/cms/dashboard-stats`
- **Admin Auth**: `POST /api/auth/login`, `GET /api/auth/verify`

---

## 🌐 Connecting to Netlify Frontend
Because **CORS is enabled by default** for all origins (`app.use(cors())`), your Netlify-hosted frontend can communicate directly with your Render backend URL without CORS blocking.
