# Troubleshooting Guide

## Common Issues & Solutions

### 🎮 Gameplay Issues

#### "I can't see my piece when I spawn"

**Symptoms:**
- Board appears but no pieces visible
- Just see purple/black checkerboard
- Stats panel shows "NOT FOUND" for position

**Solutions:**
1. **Check browser console (F12)**
   - Look for debug logs starting with 🎮, 📍, 👑
   - Should see: "Viewport sync received", "Camera centered on king"
   - If missing, WebSocket might not be connected

2. **Verify images loaded**
   - Console should show: `🖼️ Loaded image: wk.png (6/6)`
   - If images fail to load, check `client/assets/` directory

3. **Hard refresh**
   - Press Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
   - Clears any cached code

4. **Check zoom level**
   - You might be too zoomed in/out
   - Press Z several times to zoom out
   - Or scroll mouse wheel

5. **Check camera position**
   - Open console and type: `console.log(camera)`
   - Should show x, y coordinates near your spawn
   - If camera is at (0,0) but you spawned far away, that's the issue

**Debug commands to try:**
```javascript
// In browser console (F12)
console.log({selfId, camera, infiniteMode});
console.log(spatialHash.getAllPieces());
changed = true; // Force render
```

#### "Colors don't work / pieces are wrong color"

**Check:**
1. Selected color in deploy screen
2. Console log: `📤 Sending player info: { color: "#FFB3BA" }`
3. Your pieces should match the color you selected
4. Other players will have different colors

**Fix:**
```javascript
// Force color update
window.playerColor = "#FFB3BA"; // or your color
```

#### "I can't move pieces"

**Check:**
1. Click your own pieces (they should have purple highlight)
2. Legal moves show as small black dots
3. Move cooldown might be active (1.5 seconds between moves)
4. Check console for move-related errors

**Debug:**
```javascript
// Check if piece belongs to you
spatialHash.get(x, y).team === selfId
```

#### "Camera won't move"

**Solutions:**
1. **Keyboard panning**: Use WASD or Arrow keys
2. **Mouse panning**: Right-click and drag, or middle-click and drag
3. **Zoom**: Scroll wheel, or Z/X keys
4. **In 64x64 mode**: Camera is constrained to board boundaries

**Check if panning is working:**
```javascript
// Should update as you pan
console.log(camera);
```

### 🔄 Hot Reloading Issues

#### "Changes don't appear after saving"

**Solutions:**
1. **Check server restarted**
   - Terminal should show: `🔄 Restarting server due to file changes...`
   - If not, nodemon might not be watching

2. **Refresh browser**
   - Press F5 (not Cmd+R on Mac)
   - Should see changes immediately
   - No hard refresh needed

3. **Clear cache if stuck**
   - Open DevTools (F12)
   - Right-click refresh button
   - Select "Empty Cache and Hard Reload"

4. **Verify file is saved**
   - Check file modification timestamp
   - Some editors delay saves

5. **Check file is in watched directory**
   - Nodemon watches: `server/`, `shared/`, `client/`
   - Files outside these won't trigger restart

#### "Nodemon not restarting"

**Check:**
1. Is `nodemon` installed?
   ```bash
   npm list nodemon
   ```

2. Is `nodemon.json` present?
   ```bash
   ls -la nodemon.json
   ```

3. Try manual restart
   - In terminal with `npm run dev` running
   - Type `rs` and press Enter

4. Check nodemon config
   ```json
   {
     "watch": ["server", "shared", "client"],
     "ext": "js,json,html,css"
   }
   ```

### 🌐 Connection Issues

#### "Can't connect to server"

**Check:**
1. Server is running
   ```bash
   npm run dev
   ```
   - Should see: "Server Listening to Port 3000"

2. Correct URL
   - Should be: `http://localhost:3000`
   - Not: `http://127.0.0.1:3000` (might work but use localhost)

3. Port not in use
   ```bash
   lsof -i :3000
   ```
   - If something else is using port 3000, kill it:
   ```bash
   kill -9 <PID>
   ```

4. Firewall blocking
   - Check system firewall settings
   - Allow Node.js to accept connections

#### "WebSocket disconnects randomly"

**Causes:**
1. Server crashed (check terminal for errors)
2. Network issue
3. Browser closed connection (check console)

**Auto-reconnect:**
- Client should reconnect automatically
- Might need to refresh page

### 🎨 Visual Issues

#### "Board is still green/beige instead of purple/black"

**Solutions:**
1. Hard refresh (Cmd+Shift+R)
2. Check `client.js`:
   ```javascript
   const colors = ["#000000", "#432FE9"]; // Should be this
   ```
3. Clear browser cache completely

#### "Pastel colors not showing in deploy screen"

**Check `client/index.html`:**
```html
<div class="color-swatch" data-color="#FFB3BA" style="background: #ffb3ba"></div>
```

#### "Statistics panel not showing"

**Check:**
1. Should be top-left corner
2. Might be hidden behind other UI
3. Check CSS: `.stats-panel { display: ... }`

**Force show:**
```javascript
document.querySelector('.stats-panel').style.display = 'block';
```

### ⚙️ Performance Issues

#### "Game is laggy/slow"

**Optimizations:**
1. **Reduce viewport range**
   - In `server/index.js`: `VIEWPORT_RADIUS = 30` (lower for better performance)

2. **Limit piece rendering**
   - Already limited to viewport
   - Check spatial hash is working

3. **Check console for errors**
   - Errors in render loop will slow down

4. **Monitor FPS**
   ```javascript
   // In console
   let lastTime = 0;
   setInterval(() => {
     const now = performance.now();
     const fps = 1000 / (now - lastTime);
     console.log('FPS:', fps.toFixed(1));
     lastTime = now;
   }, 1000);
   ```

#### "Too many pieces spawning"

**Expected behavior:**
- Neutral pieces will spawn up to 5000 total
- This is normal!
- Stops at 5000

**If too many:**
- Change in `server/index.js`:
  ```javascript
  const targetPieces = 5000; // Reduce this number
  ```

### 📦 Build/Install Issues

#### "npm install fails"

**Solutions:**
1. Update Node.js to v18+
   ```bash
   node --version
   ```

2. Clear npm cache
   ```bash
   npm cache clean --force
   rm -rf node_modules package-lock.json
   npm install
   ```

3. Check for native module issues
   - `uWebSockets.js` requires build tools
   - On Mac: Install Xcode Command Line Tools
   - On Windows: Install Visual Studio Build Tools

#### "Module not found errors"

**Check:**
1. All dependencies installed
   ```bash
   npm install
   ```

2. Correct import paths
   ```javascript
   import '../shared/constants.js'; // Relative path
   ```

3. File extensions included for ES modules

### 🐛 Debug Mode

Enable verbose logging:

```javascript
// In client/client.js - top of file
const DEBUG = true;

// Then add throughout code:
if (DEBUG) console.log('debug info', data);
```

### 📊 Useful Console Commands

**Client Console (F12):**
```javascript
// Check game state
console.log({selfId, playerName, playerColor, infiniteMode, camera});

// Check pieces
console.log('My pieces:', spatialHash.getAllPieces().filter(p => p.team === selfId));

// Check all pieces
console.log('All pieces:', spatialHash.getAllPieces());

// Force render
changed = true;

// Check if images loaded
console.log({imgsLoaded, audioLoaded});

// Reset camera
camera.x = 0;
camera.y = 0;
camera.scale = 1;
changed = true;

// Toggle infinite mode
window.infiniteMode = !window.infiniteMode;
console.log('Infinite mode:', window.infiniteMode);
```

**Server Console:**
```javascript
// In server terminal, you can't run commands
// But you can add console.logs and restart
```

### 🔍 Finding Errors

**Client errors:**
1. Open DevTools (F12)
2. Go to Console tab
3. Look for red error messages
4. Check Network tab for failed requests

**Server errors:**
1. Look at terminal where `npm run dev` is running
2. Errors will appear in red
3. Stack traces show file and line number

### 📝 Reporting Issues

When asking for help, include:

1. **Browser console logs** (F12 → Console tab)
2. **Server terminal output**
3. **Steps to reproduce**
4. **What you expected vs what happened**
5. **Screenshots if visual issue**
6. **Browser and OS version**

### 🎯 Quick Fixes Checklist

- [ ] Hard refresh (Cmd+Shift+R / Ctrl+Shift+R)
- [ ] Check console for errors
- [ ] Verify server is running
- [ ] Check WebSocket connection
- [ ] Verify images loaded
- [ ] Check camera position
- [ ] Try zoom in/out
- [ ] Restart server
- [ ] Clear browser cache
- [ ] Try different browser

### 🚀 Emergency Reset

If everything is broken:

```bash
# Stop server (Ctrl+C)

# Clean everything
rm -rf node_modules package-lock.json server/*.dat

# Reinstall
npm install

# Start fresh
npm run dev

# In browser: Hard refresh (Cmd+Shift+R)
```

### 💡 Known Limitations

1. **Hot reloading requires manual refresh (F5)**
   - Not true live reload
   - Small price for simplicity

2. **Image caching can be aggressive**
   - Might need hard refresh for image changes

3. **WebSocket reconnection not perfect**
   - Might need to refresh page after server restart

4. **64x64 mode camera boundaries are strict**
   - By design to keep board in view

### 📚 Additional Resources

- **Architecture**: See `ARCHITECTURE.md`
- **Development**: See `DEVELOPMENT.md`
- **Quick Reference**: See `QUICKSTART.md`
- **Recent Fixes**: See `FIXES-ROUND2.md`

### 🆘 Still Stuck?

1. Check all console logs (both client and server)
2. Try the emergency reset above
3. Look for similar issues in documentation
4. Check if it's a known limitation
5. Make sure you're on latest code