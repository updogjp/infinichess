# Game Mode Configuration

## Overview

Infinichess now supports two game modes controlled **entirely by the server**:
- **64x64 Board Mode** (default) - Classic bounded board
- **Infinite Mode** - Unlimited world size

The game mode is configured on the server and automatically synced to all clients. There are no client-side toggles.

---

## 🎮 Configuration

### Server Settings
**File:** `server/index.js`

```javascript
// Game mode configuration
const GAME_CONFIG = {
  infiniteMode: false, // Set to true for infinite world, false for 64x64 board
};
```

### Change Game Mode
1. Open `server/index.js`
2. Find `GAME_CONFIG` (around line 40)
3. Set `infiniteMode: true` or `infiniteMode: false`
4. Restart server

```bash
# Stop server
pm2 stop infinichess  # or Ctrl+C

# Start server
npm start
```

---

## 📊 Mode Comparison

### 64x64 Board Mode (Default)
```javascript
const GAME_CONFIG = {
  infiniteMode: false,
};
```

**Features:**
- ✅ Fixed 64×64 grid (4096 squares)
- ✅ Red border around board
- ✅ "64x64 DEBUG MODE" label
- ✅ Camera constrained to board boundaries
- ✅ Players spawn within 0-63 on both axes
- ✅ AI spawns within board boundaries
- ✅ Minimap shows entire board
- ✅ Classic chess feel

**Best For:**
- Testing and debugging
- Faster games with more interaction
- Traditional chess gameplay
- Smaller player counts (1-10)

### Infinite Mode
```javascript
const GAME_CONFIG = {
  infiniteMode: true,
};
```

**Features:**
- ✅ Unlimited world size
- ✅ No boundaries or borders
- ✅ Camera can pan anywhere
- ✅ Players spawn within ±50000 units
- ✅ AI spawns near players (2000px radius)
- ✅ Minimap shows nearby area
- ✅ Exploration gameplay

**Best For:**
- Large player counts (10+)
- Long-term worlds
- Exploration and expansion
- Persistent server gameplay

---

## 🔄 How It Works

### Server → Client Sync

1. **Server starts** with configured `infiniteMode` setting
2. **Player connects** and completes captcha
3. **Server sends viewport sync** (message 55553):
   ```
   [magic: 55553]
   [playerId: uint16]
   [pieceCount: uint16]
   [infiniteMode: uint16]  ← Game mode flag (0 or 1)
   [pieces: x, y, type, team...]
   ```
4. **Client receives** and sets `window.infiniteMode`
5. **Client applies** appropriate rendering and boundaries

### No Client Override
- Client-side toggle has been removed
- All clients use server's setting
- Consistent experience for all players
- No conflicting behavior

---

## 🎯 Behavior Differences

### Player Spawning

#### 64x64 Mode
```javascript
// Random position within board
x = Math.floor(Math.random() * 64);  // 0-63
y = Math.floor(Math.random() * 64);  // 0-63
```

#### Infinite Mode
```javascript
// Random position within large radius
const angle = Math.random() * Math.PI * 2;
const dist = Math.random() * 50000;
x = Math.floor(Math.cos(angle) * dist);
y = Math.floor(Math.sin(angle) * dist);
```

### AI Spawning

#### 64x64 Mode
```javascript
// Spawn near player, clamped to board
x = Math.max(0, Math.min(63, x));
y = Math.max(0, Math.min(63, y));
```

#### Infinite Mode
```javascript
// Spawn anywhere within 2000px of player
// No clamping needed
```

### Camera Constraints

#### 64x64 Mode
```javascript
// Keep board in view
const boardSize = 64 * squareSize;
camera.x = Math.max(minX, Math.min(maxX, camera.x));
camera.y = Math.max(minY, Math.min(maxY, camera.y));
```

#### Infinite Mode
```javascript
// No constraints
// Camera can pan anywhere
```

### Visual Indicators

#### 64x64 Mode
- Red border around board (8px thick)
- "64x64 DEBUG MODE" label at top
- Stats show "MODE: 64x64"
- Minimap shows entire board

#### Infinite Mode
- No borders
- No mode label
- Stats show "MODE: INFINITE"
- Minimap shows nearby area

---

## 🧪 Testing

### Test 64x64 Mode
1. Set `infiniteMode: false`
2. Restart server
3. Connect and spawn
4. **Should see:**
   - Red border around 64×64 board
   - "64x64 DEBUG MODE" text
   - Stats panel shows "MODE: 64x64"
   - Can't pan outside board
5. **Try:**
   - Pan to edges → camera stops at boundaries
   - Spawn multiple players → all within 0-63
   - Check AI pieces → all within board

### Test Infinite Mode
1. Set `infiniteMode: true`
2. Restart server
3. Connect and spawn
4. **Should see:**
   - No borders
   - No mode label
   - Stats panel shows "MODE: INFINITE"
   - Can pan anywhere
5. **Try:**
   - Pan far away → no limits
   - Spawn multiple players → spread out
   - Check AI pieces → near players

---

## 📝 Console Logs

### Server Startup
```
[GAME] Mode: 64x64 BOARD
```
or
```
[GAME] Mode: INFINITE
```

### Client Viewport Sync
```javascript
🎮 Viewport sync received: {
  selfId: 1234,
  count: 15,
  infiniteMode: false  // or true
}
```

### Client Stats Panel
- Shows current mode in real-time
- Updates immediately on connection

---

## ⚙️ Advanced Configuration

### Hybrid Approach (Not Recommended)
While possible to change `GAME_CONFIG.infiniteMode` at runtime, it's not recommended:

```javascript
// NOT RECOMMENDED - causes inconsistency
if (Object.keys(clients).length > 20) {
  GAME_CONFIG.infiniteMode = true; // Switch to infinite
}
```

**Why not?**
- Existing players still have old mode
- Requires disconnect/reconnect to sync
- Causes confusion

**Better approach:**
- Choose one mode per server instance
- Restart server to change modes
- Or run separate servers for each mode

---

## 🔧 Troubleshooting

### Mode Not Syncing
**Symptoms:** Client shows wrong mode or old mode

**Check:**
1. Server logs show correct mode at startup
2. Client received viewport sync (check console)
3. `window.infiniteMode` matches server setting

**Fix:**
```javascript
// In browser console
console.log("Client mode:", window.infiniteMode);
// Should match server's GAME_CONFIG.infiniteMode
```

### Players Spawning Outside Board (64x64)
**Symptoms:** Players appear at x > 63 or y > 63

**Check:**
1. `GAME_CONFIG.infiniteMode = false` on server
2. `findSpawnLocation()` respects boundaries

**Fix:**
- Ensure server restarted after config change
- Check for old code paths that don't use GAME_CONFIG

### Camera Not Constrained (64x64)
**Symptoms:** Can pan outside board in 64x64 mode

**Check:**
1. `window.infiniteMode` is false on client
2. Camera constraint code is active

**Fix:**
```javascript
// In browser console
window.infiniteMode = false; // Force correct mode
changed = true; // Trigger re-render
```

---

## 📚 Code Reference

### Server
- `server/index.js` (line ~40): `GAME_CONFIG` definition
- `server/index.js` (line ~55): Mode logging
- `server/index.js` (line ~220): Spawn location with boundaries
- `server/index.js` (line ~275): Viewport sync with mode flag
- `server/index.js` (line ~368): AI spawn with boundaries

### Client
- `client/networking.js` (line ~7): `window.infiniteMode` default
- `client/networking.js` (line ~85): Mode sync from server
- `client/client.js` (line ~437): Camera boundary constraints
- `client/client.js` (line ~504): Board border rendering
- `client/client.js` (line ~858): Stats panel mode display

---

## 🎯 Best Practices

1. **Choose Mode Before Launch**
   - Decide on 64x64 or infinite before going live
   - Don't change frequently

2. **Communicate to Players**
   - Let players know which mode is active
   - Explain any mode-specific features

3. **Monitor Performance**
   - Infinite mode may need more resources with many players
   - 64x64 mode is more predictable

4. **Test Both Modes**
   - Ensure spawning works correctly
   - Verify boundaries are respected
   - Check AI behavior

5. **Document Your Choice**
   - Note in README which mode you're using
   - Explain any custom configurations

---

## 🚀 Quick Reference

### Enable Infinite Mode
```javascript
const GAME_CONFIG = {
  infiniteMode: true,
};
```

### Enable 64x64 Mode (Default)
```javascript
const GAME_CONFIG = {
  infiniteMode: false,
};
```

### Check Current Mode (Browser Console)
```javascript
console.log("Mode:", window.infiniteMode ? "INFINITE" : "64x64");
```

### Check Current Mode (Server Logs)
```
Look for: [GAME] Mode: ...
```

---

**Last Updated:** Current session  
**Status:** ✅ Implemented and tested  
**Default:** 64x64 Board Mode (`infiniteMode: false`)