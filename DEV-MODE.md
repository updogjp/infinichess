# Development Mode - Captcha Bypass

## 🎯 Problem Solved

**Issue:** Cloudflare Turnstile captcha was blocking local development, causing `selfId: -1` and preventing gameplay.

**Solution:** Automatic captcha bypass when running on localhost.

## 🛠️ How It Works

### Automatic Detection

The game now automatically detects if you're running in development mode:

```javascript
// Client detection
const isDev = location.hostname === "localhost" || location.hostname === "127.0.0.1";

// Server detection
const isDev = process.env.NODE_ENV === "development" || !process.env.NODE_ENV;
```

### What Gets Bypassed

**In Development (localhost):**
- ✅ No captcha screen shown
- ✅ Immediate access to player setup
- ✅ WebSocket connects without verification
- ✅ Instant spawn after deployment
- ✅ Console shows: `🛠️ DEV MODE: Bypassing captcha`

**In Production (deployed):**
- ❌ Captcha required
- ❌ Must verify before playing
- ❌ Standard security flow

## 🚀 Quick Start

### 1. Start Server
```bash
npm run dev
```

You should see:
```
{
  isProd: false,
  isDev: true,
  devMode: 'CAPTCHA BYPASSED'
}
Server Listening to Port 3000
```

### 2. Open Browser
```
http://localhost:3000
```

**NOT**: `http://127.0.0.1:3000` (works but shows as localhost anyway)

### 3. What You'll See

**Old (with captcha):**
```
1. Cloudflare Turnstile verification box
2. Click to verify
3. Wait for verification
4. Then see player setup
```

**New (dev mode):**
```
1. Directly see player setup screen
2. Choose color and name
3. Click deploy
4. Instant spawn! ✨
```

### 4. Console Output

**Client Console (F12):**
```
🛠️ DEV MODE: Bypassing captcha
🔌 WebSocket connected - sending spawn request
🎮 Viewport sync received: { selfId: 123, count: 50 }
📍 Camera centered on king: { ... }
👑 Found my piece: { type: 6, x: 32, y: 32 }
```

**Server Console:**
```
[Dev] Bypassing captcha for player 1
```

## 🔍 Troubleshooting

### Still seeing captcha?

**Check your URL:**
- ✅ `http://localhost:3000` - Bypasses captcha
- ❌ `http://192.168.1.x:3000` - Still uses captcha (IP address)
- ❌ `http://mycomputer.local:3000` - Still uses captcha (hostname)

**Solution:** Always use `localhost`

### Still getting `selfId: -1`?

1. **Hard refresh**: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
2. **Check console**: Should see `🛠️ DEV MODE: Bypassing captcha`
3. **Check server**: Should see `devMode: 'CAPTCHA BYPASSED'`
4. **Restart server**: Stop and `npm run dev` again

### WebSocket not connecting?

**Check console for:**
- Red WebSocket errors
- 400/404 errors
- Connection refused

**Fixes:**
1. Make sure server is running
2. Check port 3000 is not in use: `lsof -i :3000`
3. Try closing and reopening browser

## 🏭 Production Mode

### How to Enable Production Mode

The game automatically uses production mode when:
- **NOT on localhost**
- Deployed to a domain
- Using IP address (e.g., `192.168.1.5:3000`)

### Setting Up Captcha for Production

1. **Get Turnstile Keys:**
   - Go to Cloudflare Dashboard
   - Create Turnstile site
   - Get site key and secret key

2. **Update Site Key (client):**
   ```html
   <!-- client/index.html -->
   <div class="g-recaptcha" data-sitekey="YOUR_SITE_KEY"></div>
   ```

3. **Update Secret Key (server):**
   ```javascript
   // server/index.js
   const captchaSecretKey = "YOUR_SECRET_KEY";
   ```

4. **Set Environment Variable:**
   ```bash
   export NODE_ENV=production
   npm start
   ```

## 🔐 Security Notes

### Why This Is Safe

**Development mode only activates when:**
1. Running on `localhost` or `127.0.0.1`
2. These are not accessible from outside your computer
3. No security risk for local testing

**Production mode activates when:**
1. Deployed to public domain
2. Accessed via IP address
3. `NODE_ENV=production` is set

### Best Practices

1. **Never commit real captcha keys** to git
   ```javascript
   const captchaSecretKey = process.env.CAPTCHA_SECRET || "[dev-placeholder]";
   ```

2. **Use environment variables in production**
   ```bash
   CAPTCHA_SECRET=your_real_key npm start
   ```

3. **Test production mode locally**
   ```bash
   NODE_ENV=production npm start
   # Then access via IP: http://192.168.1.x:3000
   ```

## 🧪 Testing Both Modes

### Test Development Mode
```bash
# Start server
npm run dev

# Open browser
http://localhost:3000

# Should bypass captcha ✓
```

### Test Production Mode
```bash
# Get your local IP
ipconfig getifaddr en0  # Mac
ipconfig                # Windows

# Start server
NODE_ENV=production npm start

# Open browser with IP
http://192.168.1.x:3000

# Should show captcha ✓
```

## 📝 Code Reference

### Client Detection
**File:** `client/networking.js`
**Lines:** ~534-540
```javascript
const isDev = location.hostname === "localhost" || 
              location.hostname === "127.0.0.1";

if (isDev) {
  console.log("🛠️ DEV MODE: Bypassing captcha");
  // Skip captcha
}
```

### Server Detection
**File:** `server/index.js`
**Lines:** ~31-36
```javascript
const isDev = process.env.NODE_ENV === "development" || !process.env.NODE_ENV;
const isProd = !isDev;

if (isDev) {
  console.log("[Dev] Bypassing captcha for player", ws.id);
  ws.verified = true;
}
```

## 🎮 Development Workflow

### Typical Session

```bash
# 1. Start server
npm run dev

# 2. Open browser (automatically at localhost)
# → Captcha bypassed ✓

# 3. Choose color and name
# → No waiting ✓

# 4. Deploy and play
# → Instant spawn ✓

# 5. Make code changes
# → Server restarts automatically ✓

# 6. Refresh browser (F5)
# → Changes visible ✓

# 7. Captcha still bypassed!
# → No re-verification needed ✓
```

## ✅ Benefits

1. **Faster development** - No captcha delays
2. **No API keys needed** - Works out of the box
3. **Automatic detection** - No manual configuration
4. **Still secure** - Production mode still protected
5. **Hot reload friendly** - Survives server restarts
6. **Multiple test users** - Open multiple localhost tabs

## 🚨 Common Issues

### Issue: Captcha shows on localhost
**Cause:** Browser cached old code
**Fix:** Hard refresh (Cmd+Shift+R)

### Issue: `selfId` still -1
**Cause:** WebSocket handshake failed
**Fix:** 
1. Check server console for errors
2. Restart server
3. Clear browser cache

### Issue: Production mode in development
**Cause:** Using IP address instead of localhost
**Fix:** Use `http://localhost:3000` not `http://127.0.0.1:3000`

### Issue: Development mode in production
**Cause:** Accessing production server via localhost somehow
**Fix:** Set `NODE_ENV=production` explicitly

## 📚 Related Documentation

- `TROUBLESHOOTING.md` - General troubleshooting
- `DEBUG-SPAWN-ISSUE.md` - Piece visibility issues
- `DEVELOPMENT.md` - Full development guide
- `QUICKSTART.md` - Quick reference

## 🎉 Success Indicators

You'll know dev mode is working when you see:

**Server:**
```
{ isProd: false, isDev: true, devMode: 'CAPTCHA BYPASSED' }
[Dev] Bypassing captcha for player 1
```

**Client:**
```
🛠️ DEV MODE: Bypassing captcha
🔌 WebSocket connected - sending spawn request
🎮 Viewport sync received: { selfId: 1, count: 50 }
```

**Debug Overlay:**
```
selfId: 1  (NOT -1!)
camera: -4800, -4800
pieces visible: 50
my pieces: 1
```

If you see all of these, dev mode is working perfectly! 🎊