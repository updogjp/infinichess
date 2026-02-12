# Testing Guide - After Fixes Applied

## Quick Test Procedure

### 1. Restart the Server
```bash
cd /Users/gjworrall/Documents/10kchess-main
npm start
```

### 2. Open Browser
- Navigate to `http://localhost:3000`
- Open Developer Console (F12)

### 3. Expected Flow - Dev Mode

#### Step 1: Connection
You should see in console:
```
🔧 DEV MODE: Bypassing captcha, showing player setup
🎮 Initializing player setup modal
🎮 Found color swatches: 8
```

#### Step 2: Player Setup Modal
- Modal should appear with:
  - Name input field (placeholder: "ENTER_CALLSIGN")
  - 8 color swatches (pastel colors)
  - Preview canvas showing king piece
  - "[ INITIATE_DEPLOYMENT ]" button

#### Step 3: Enter Name
- Type "greg" (or any name)
- Preview should update in real-time
- Selected color swatch should have border

#### Step 4: Click Start
Console should show:
```
🚀 Start button clicked: {
  playerName: 'greg',
  playerColor: '#FFB3BA',
  connected: true
}
📤 Sending player info: { ... }
📤 Sent spawn trigger
```

#### Step 5: Server Confirms
Server console should show:
```
[Dev] Bypassing captcha for player 1, waiting for player info
[INFO] Player 1 sent name info - Raw: "greg", Length: 4, Color: rgb(255,179,186)
[SUCCESS] Player 1 set name: "greg", color: rgb(255,179,186)
[SPAWN] Found spawn location at X,Y
[SPAWN] Player 1 spawning king at X,Y
[SPAWN] Updated metadata for player 1: greg at X,Y
[LEADERBOARD] Sending to 1 players: greg(0)
```

#### Step 6: Verify UI
- **Stats Panel (top left):**
  - PLAYER: greg
  - COLOR: #FFB3BA
  - MODE: 64x64
  - POSITION: X,Y (not "NOT FOUND")
  - PIECES: 1 (your king)

- **Leaderboard (top right):**
  - "1 ONLINE" (not "0 ONLINE")
  - Shows: "greg [0]" with colored square
  - NO color names like "mediumaquamarine"

- **Game Board:**
  - Should see checkered board (purple squares)
  - King piece visible at spawn location
  - Camera centered on your king

### 4. Expected Behavior - 64x64 Mode

✅ **Should See:**
- 64x64 checkered board
- ~253 neutral pieces (gray/white)
- Your king piece (colored)
- Red border around visible area

❌ **Should NOT See:**
- AI pieces spawning
- "mediumaquamarine" or "rosybrown" in leaderboard
- "NOT FOUND" in position
- "0 ONLINE" when players connected
- Weird line below "LEADERBOARD" text

### 5. Test Multiple Players

Open a second browser tab/window:
- Repeat steps above with different name (e.g., "alice")
- Both players should appear in leaderboard
- Online count should show "2 ONLINE"
- Both names should be visible (not color names)

### 6. Test Controls

- **WASD / Arrow Keys:** Pan camera
- **Mouse Wheel:** Zoom in/out
- **Left Click:** Select piece
- **Drag:** Move piece
- **Enter:** Open chat
- **H:** Toggle UI

## Common Issues & Solutions

### Issue: Still seeing color names
**Solution:** Clear browser cache and restart server
```bash
# Kill server (Ctrl+C)
rm playerMetadata.json  # Clear saved player data
npm start
```

### Issue: King not spawning
**Check console for:**
```
[SPAWN] Waiting for player X to complete setup
```
This means player info wasn't sent. Verify:
1. Color swatches are clickable
2. Name was entered
3. Start button was clicked
4. No console errors

### Issue: "0 ONLINE" in leaderboard
**Solution:** Refresh page - should fix itself

### Issue: No pieces visible
**Check:**
1. Position in stats shows actual coords (not "NOT FOUND")
2. Zoom level (try zooming out with Z key)
3. Camera position (use WASD to look around)

### Issue: AI pieces spawning in 64x64
**This is a bug!** Should not happen. Check:
```bash
# Server should log:
[AI] System enabled - 8 pieces per player, spawn radius: 2000
```
But AI pieces should NOT spawn in 64x64 mode.

## Success Criteria

All of these must be true:
- ✅ Player name appears in leaderboard (not color name)
- ✅ Stats panel shows correct player name
- ✅ Online count shows correct number
- ✅ King piece spawns and is visible
- ✅ No AI pieces in 64x64 mode
- ✅ No weird line in leaderboard
- ✅ Position shows coordinates (not "NOT FOUND")

## Debug Commands

### Check Player Metadata
In browser console:
```javascript
console.log(window.playerName)    // Should show your name
console.log(window.playerColor)   // Should show hex color
console.log(window.selfId)        // Should show your player ID
```

### Check Spatial Hash
```javascript
console.log(spatialHash.count())  // Total pieces on board
console.log(spatialHash.getAllPieces())  // List all pieces
```

### Force Render
```javascript
changed = true  // Forces next frame to render
```

## Performance Check

Game should run smoothly at 60 FPS:
- No lag when moving camera
- Smooth piece movement
- Instant UI updates

If slow:
1. Check piece count (should be ~254 in 64x64: 253 neutral + 1 king)
2. Verify AI is disabled (no extra pieces spawning)
3. Check browser console for errors

## Next Steps

If all tests pass:
1. Try capturing enemy pieces
2. Test chat functionality (Enter key)
3. Test multiple browser tabs (2+ players)
4. Test respawn after king captured
5. Verify leaderboard updates with kill counts

If tests fail:
1. Copy ALL console output (client + server)
2. Take screenshot of game state
3. Note which specific test failed
4. Check files were saved correctly