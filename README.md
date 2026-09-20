# NextGen AR/VR Portal - Standalone Backend API

This is the standalone backend API server for the NextGen AR/VR Portal with live cloud database persistence (Supabase PostgreSQL / MongoDB Atlas).

## Quick Deployment to Render
1. Push this folder to a GitHub repository (e.g. `nextgen-arvr-backend`).
2. In [Render Dashboard](https://dashboard.render.com), click **New +** -> **Web Service** and select your repository.
3. Configure settings:
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node index.js`
4. In the **Environment** tab on Render, add:
   - `DATABASE_URL`: Your Supabase connection URI (or `MONGODB_URI` for MongoDB Atlas)
5. Done! Your server will start and connect automatically.
