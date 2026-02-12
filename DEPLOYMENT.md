# Deployment Guide

## Architecture
- **Backend**: Node.js WebSocket server on Render.com
- **Frontend**: Static client files on Cloudflare Pages
- **API**: WebSocket connection from client to backend

## Backend (Render.com) — Already Live ✓

Server is running at: `https://infinichess.onrender.com`

### Configuration
- **Build Command**: `npm run build`
- **Start Command**: `npm start`
- **Environment**: Node.js
- **Config File**: `render.yaml`

The server automatically:
- Listens on port 3000 (Render assigns the actual port via `PORT` env var)
- Serves WebSocket connections
- Handles game logic, AI, and player management

## Frontend (Cloudflare Pages)

### Setup Instructions

1. **Create Cloudflare Pages Project**
   - Go to https://dash.cloudflare.com
   - Pages → Create a project → Connect to Git
   - Select your GitHub repo
   - Framework preset: **None** (custom)

2. **Configure Build Settings**
   - Build command: `npm run build`
   - Build output directory: `client`
   - Root directory: `/`

3. **Environment Variables**
   - Add `NODE_VERSION`: `22`

4. **Create `wrangler.toml`** (in root directory)
   ```toml
   name = "infinichess-client"
   type = "javascript"
   
   [env.production]
   name = "infinichess-prod"
   
   [build]
   command = "npm run build"
   cwd = "./"
   watch_paths = ["client/**/*"]
   
   [build.upload]
   format = "service-worker"
   
   [[build.upload.rules]]
   type = "Text"
   globs = ["**/*.html", "**/*.css", "**/*.js"]
   fallthrough = true
   
   [[build.upload.rules]]
   type = "Bytes"
   globs = ["**/*.png", "**/*.jpg", "**/*.jpeg", "**/*.gif", "**/*.svg", "**/*.mp3", "**/*.wav"]
   fallthrough = true
   ```

5. **Create `_redirects`** (in `client/` directory)
   ```
   /* /index.html 200
   ```
   This ensures all routes serve `index.html` (SPA routing).

6. **Update Client WebSocket URL**
   
   In `client/networking.js`, update the WebSocket connection:
   ```javascript
   // Detect environment and set API URL
   const API_URL = window.location.hostname === 'localhost' 
     ? 'ws://localhost:3000'
     : 'wss://infinichess.onrender.com';
   
   const ws = new WebSocket(API_URL);
   ```

### Deployment
- Push to GitHub → Cloudflare Pages auto-deploys
- Check deployment status in Cloudflare dashboard

## CORS & WebSocket Configuration

### Render.com Server
The server already accepts WebSocket connections from any origin (configured in `server/index.js`).

### Cloudflare Pages
- Serves static files only
- WebSocket connections go directly to Render backend
- No CORS issues (WebSocket is not HTTP)

## Testing

1. **Local Development**
   ```bash
   npm run dev          # Starts server on localhost:3000
   # Open http://localhost:3000 in browser
   ```

2. **Production**
   - Client: `https://your-cloudflare-domain.pages.dev`
   - Server: `https://infinichess.onrender.com`
   - WebSocket: `wss://infinichess.onrender.com`

## Environment Variables

### Render.com
- `NODE_ENV`: `production` (set automatically)
- No additional variables needed

### Cloudflare Pages
- `NODE_VERSION`: `22`
- No additional variables needed

## Troubleshooting

### WebSocket Connection Fails
- Check that Render server is running: `https://infinichess.onrender.com` (should show connection refused in browser, which is expected)
- Verify WebSocket URL in `client/networking.js` matches your Render domain
- Check browser console for connection errors

### Build Fails on Cloudflare
- Ensure `npm run build` passes locally: `npm run build`
- Check that all dependencies are in `package.json`
- Verify Node version is 18+

### Assets Not Loading
- Ensure `client/` directory contains all static files
- Check `_redirects` file is in `client/` directory
- Verify Cloudflare build output directory is set to `client`
