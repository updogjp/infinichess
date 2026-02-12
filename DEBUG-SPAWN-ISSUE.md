# Debug Guide: Piece Not Visible on Spawn

## Quick Test - Do This First!

1. **Open the game**: http://localhost:3000
2. **Complete captcha**
3. **Select a color and name**
4. **Click "INITIATE_DEPLOYMENT"**
5. **Open browser console immediately** (F12)

## What You Should See in Console

### ✅ Good Signs:
```
🖼️ Loaded image: wk.png (6/6)
✅ All images loaded, starting render loop
🎮 Viewport sync received: { selfId: 123, count: 50 }
📦 All pieces in viewport: [...]
📍 Camera centered on king: { kingPos: {x: 32, y: 32}, cameraPos: {x: -4800, y: -4800} }
👑 Found my piece: { type: 6, x: 32, y: 32, team: 123 }
🛠️ Debug commands available:
```

### ❌ Bad Signs:
```
⚠️ Player king not found in viewport!
⚠️ No player pieces found!
❌ Failed to load image
```

## Debug Overlay (Bottom Left)

For the first 10 seconds, you'll see a debug panel showing:
- `selfId`: Your player ID (should NOT be -1)
- `camera`: Camera position
- `scale`: Zoom level
- `pieces visible`: Total pieces in view
- `my pieces`: Your pieces count (should be at least 1)
- `changed`: Render flag

## Interactive Debug Commands

Open console (F12) and try these:

### 1. Check Game State
```javascript
debugGame()
```
Shows: selfId, camera position, piece counts, etc.

### 2. Find Your King
```javascript
findMyKing()
```
Searches for your king and centers camera on it.

### 3. Request Viewport Refresh
```javascript
requestViewport()
```
Asks server to send pieces in current view.

### 4. Reset Camera
```javascript
resetCamera()
```
Moves camera back to (0, 0).

### 5. Manual Camera Control
```javascript
// Move camera to specific coordinates
camera.x = -5000;
camera.y = -5000;
changed = true;

// Zoom out to see more
camera.scale = 0.5;
changed = true;
```

### 6. Check Spatial Hash
```javascript
// See all pieces
spatialHash.getAllPieces()

// See only your pieces
spatialHash.getAllPieces().filter(p => p.team === selfId)

// Check specific location
spatialHash.get(32, 32)
```

### 7. Force Render
```javascript
changed = true;
```

## Common Issues & Fixes

### Issue 1: selfId is -1
**Problem**: Not connected to server properly
**Fix**: 
- Refresh page
- Check server is running
- Check console for WebSocket errors

### Issue 2: "Player king not found in viewport"
**Problem**: King spawned but not in initial viewport sync
**Fix**:
```javascript
findMyKing()  // This will search and center camera
```

### Issue 3: Camera at wrong position
**Problem**: Camera didn't center on king
**Current**: `camera: {x: 0, y: 0}`
**Should be**: `camera: {x: -4800, y: -4800}` (or similar)
**Fix**:
```javascript
findMyKing()
```

### Issue 4: No pieces visible
**Check**: `pieces visible: 0` in debug overlay
**Try**:
```javascript
// Zoom out
camera.scale = 0.3;
changed = true;

// Request viewport
requestViewport();
```

### Issue 5: Images not loading
**Check console for**: `❌ Failed to load image`
**Fix**:
- Check `client/assets/` folder exists
- Check files: `wk.png`, `wq.png`, `wr.png`, `wb.png`, `wn.png`, `wp.png`
- Hard refresh (Cmd+Shift+R)

## Server-Side Checks

### 1. Check Terminal Output
Should see:
```
Player 123 set name: YourName, color: rgb(255,179,186)
[Viewport] Sent 50/50 pieces to player 123
```

### 2. Check Player Spawned
Look for king placement confirmation in server logs.

### 3. Check Spawn Location
In server console, the spawn location should be logged.

## Manual Testing Steps

### Test 1: Can you see the board?
- [ ] Purple and black checkerboard visible
- [ ] Board fills the screen

### Test 2: Can you pan the camera?
- [ ] Right-click + drag works
- [ ] WASD keys work
- [ ] Camera position changes in debug overlay

### Test 3: Can you zoom?
- [ ] Mouse wheel zooms
- [ ] Z/X keys zoom
- [ ] Scale changes in debug overlay

### Test 4: Are any pieces visible?
- [ ] Can see neutral pieces (white pieces)
- [ ] Can see other players' pieces (colored)
- [ ] Just can't see YOUR piece

## Emergency Procedures

### If completely stuck:

1. **Hard refresh**: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)

2. **Reset everything**:
```javascript
window.location.reload(true);
```

3. **Clear cache and reload**:
- DevTools → Application → Clear storage → Clear site data
- Reload page

4. **Server restart**:
```bash
# Stop server (Ctrl+C)
npm run dev
```

5. **Nuclear option**:
```bash
# Stop server
# Delete save files
rm server/*.dat
# Restart
npm run dev
# Hard refresh browser
```

## Expected Camera Calculations

If your king spawns at `(32, 32)`:
- Camera should be: `x: -4800, y: -4800`
- Calculation: `camera.x = -kingX * squareSize = -32 * 150 = -4800`

This centers the king in the viewport.

## What's Actually Rendering?

The render loop shows:
1. Board pattern (black/purple squares)
2. Legal move indicators (black dots)
3. Pieces from spatial hash
4. Purple highlight on your pieces
5. Debug overlay (bottom-left, first 10 seconds)
6. Stats panel (top-left)

If you see the board but no pieces, the issue is:
- Camera position wrong, OR
- Spatial hash empty, OR
- Images not loaded, OR
- Wrong team ID

## Console Log Timeline

What you should see in order:

```
🖼️ Loaded image: wp.png (1/6)
🖼️ Loaded image: wn.png (2/6)
🖼️ Loaded image: wb.png (3/6)
🖼️ Loaded image: wr.png (4/6)
🖼️ Loaded image: wq.png (5/6)
🖼️ Loaded image: wk.png (6/6)
✅ All images loaded, starting render loop
🔊 Loaded audio: move1.mp3 (1/5)
...
✅ All audio loaded
🛠️ Debug commands available:
🚀 Starting deployment: { playerName: "...", playerColor: "#FFB3BA" }
📤 Sending player info: { name: "...", color: "#FFB3BA", rgb: {...} }
🎮 Viewport sync received: { selfId: 123, count: 50 }
📦 All pieces in viewport: [...]
📍 Camera centered on king: { kingPos: {...}, cameraPos: {...} }
🎨 Rendering pieces: { visibleCount: 15, selfId: 123 }
👑 Found my piece: { type: 6, x: 32, y: 32, team: 123 }
```

If any of these are missing, that's where the problem is!

## Report Your Findings

When asking for help, provide:

1. **Console output** (copy the entire log)
2. **Debug overlay values** (screenshot or text)
3. **Output of `debugGame()`**
4. **Server terminal output**
5. **Browser and OS**

## Quick Win

Try this sequence right now:

```javascript
debugGame()         // Check state
findMyKing()        // Find and center on king
camera.scale = 0.5  // Zoom out
changed = true      // Force render
```

If your king exists, this WILL find it and show it!