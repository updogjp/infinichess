# Quick Testing Guide

## 🐛 Current Issues Being Fixed

### Issue 1: Can't Move Pieces
**Symptoms:** Player spawns with king, can click pieces but they don't move
**Debug Steps:**
1. Open browser console (F12)
2. Click on your king piece
3. Look for these log messages:
   - `🖱️ Mouse down at screen:` - Shows click coordinates
   - `🎯 Clicked square:` - Shows which square was clicked
   - `🔍 Checking square:` - Shows piece info at that square
   - `✓ Selected piece at` - Should appear if piece is yours
   - `✅ Moving piece from ... to ...` - Should appear when clicking destination

**Expected Console Output:**
```
🖱️ Mouse down at screen: 500 400 world: {x: 123, y: 456}
🎯 Clicked square: 10 15 Selected: undefined undefined
🔍 Checking square: 10 15 Piece type: 6 Piece team: 1234 Self ID: 1234
✓ Selected piece at 10 15 Legal moves: 8
```

**Common Problems:**
- ❌ `Self ID: -1` - Player not spawned yet (wait for captcha/spawn)
- ❌ `Piece team: 0` - No piece at that square
- ❌ `spatialHash not available` - Critical error, refresh page

### Issue 2: Username Not in Leaderboard
**Symptoms:** Player name not showing, or showing as "Player1234" instead
**Debug Steps:**
1. Check console for: `📤 Sending player info:`
2. Check if message was queued: `📦 Queuing message`
3. Check if message was sent: `📤 Sending message, length: X`

**Expected Console Output (Client):**
```
🚀 Starting deployment: {playerName: "YourName", playerColor: "#FFB3BA"}
📤 Sending player info: {name: "YourName", color: "#FFB3BA", connected: false}
✓ Player info sent/queued
✅ WebSocket connected, flushing 1 queued messages
📤 Flushing queued message 1 of 1
📤 Sending message, length: 15 First bytes: [223, 8, ...]
```

**Expected Console Output (Server):**
```
[INFO] Player 1234 sent name info - Raw: "YourName", Length: 8, Color: rgb(255,179,186)
[SUCCESS] Player 1234 set name: "YourName", color: rgb(255,179,186)
[LEADERBOARD] Broadcasting update for player 1234
[LEADERBOARD] Sending to 1 players: YourName(0)
```

**Common Problems:**
- Message not sent: Check if WebSocket connected (`connected: true`)
- Name sanitized: Special characters removed, max 16 chars
- Not in leaderboard: Need at least 0 kills to appear (should auto-add)

---

## 🧪 Testing Checklist

### Desktop Controls
- [ ] Left-click selects own piece (legal moves show)
- [ ] Left-click on legal move square moves piece
- [ ] Right-click + drag pans camera
- [ ] Middle-click + drag pans camera (alternative)
- [ ] Scroll wheel zooms in/out
- [ ] WASD keys move camera
- [ ] Arrow keys move camera
- [ ] Z key zooms out
- [ ] X key zooms in
- [ ] H key toggles UI

### Mobile Controls
- [ ] Single tap selects piece
- [ ] Single tap on destination moves piece
- [ ] Two-finger pinch zooms
- [ ] Two-finger drag pans camera
- [ ] Joystick (right side) moves camera
- [ ] [+] button (left bottom) zooms in
- [ ] [-] button (left middle) zooms out

### UI Elements
- [ ] Online count shows at top of leaderboard
- [ ] Online count updates when you join
- [ ] Player names in white text (readable)
- [ ] Color squares show next to names
- [ ] Stats panel shows your name
- [ ] Stats panel shows zoom level
- [ ] Stats panel shows king position
- [ ] Chessboard colors: Purple (#4F4096 and #3A2E6F)

---

## 🔍 Debugging Commands

### Browser Console Commands

```javascript
// Check if WebSocket connected
console.log("Connected:", connected);

// Check your player ID
console.log("Self ID:", selfId);

// Check your player info
console.log("Name:", playerName, "Color:", playerColor);

// Check pieces in view
console.log("Pieces:", spatialHash.getAllPieces());

// Check your pieces
console.log("My pieces:", spatialHash.getAllPieces().filter(p => p.team === selfId));

// Find your king
console.log("My king:", spatialHash.getAllPieces().find(p => p.type === 6 && p.team === selfId));

// Check camera position
console.log("Camera:", camera);

// Force render
changed = true;
```

---

## 🚀 Quick Start Test

1. **Open game in browser**
2. **Complete captcha**
3. **Enter name** (e.g., "TestPlayer")
4. **Select color**
5. **Click "INITIATE DEPLOYMENT"**
6. **Open console (F12)**
7. **Wait for spawn** (should see king piece)
8. **Check console logs:**
   - Look for `✅ WebSocket connected`
   - Look for `📤 Sending player info`
   - Look for king position in stats
9. **Try to move king:**
   - Click on king
   - Console should show `✓ Selected piece`
   - Legal moves should show on board (green highlights)
   - Click legal move square
   - Console should show `✅ Moving piece`
   - Piece should move

---

## 📊 Expected Behavior

### Successful Piece Movement Flow

1. **Click piece:**
   ```
   🖱️ Mouse down at screen: X Y world: {x, y}
   🎯 Clicked square: X Y
   🔍 Checking square: X Y Piece type: 6 Piece team: YOUR_ID
   ✓ Selected piece at X Y Legal moves: 8
   ```

2. **Click destination:**
   ```
   🖱️ Mouse down at screen: X Y world: {x, y}
   🎯 Clicked square: DEST_X DEST_Y Selected: X Y
   ✅ Moving piece from X Y to DEST_X DEST_Y
   ```

3. **Server processes move** (check server logs)

4. **Board updates** - piece appears in new location

---

## ⚠️ Common Errors

### "spatialHash not available"
- **Cause:** SpatialHash not initialized
- **Fix:** Refresh page, wait for viewport sync

### "Self ID: -1"
- **Cause:** Not spawned yet
- **Fix:** Wait 1-2 seconds after captcha

### "Can't select: not your piece"
- **Cause:** Trying to select enemy piece or empty square
- **Fix:** Click on your colored pieces only

### Piece doesn't move after clicking
- **Cause:** Click might not be on legal move square
- **Fix:** Look for green highlighted squares, click exactly on them

### Name shows as "Player1234"
- **Cause:** Name not sent to server
- **Fix:** Check console for "Sending player info" message

---

## 🛠️ Development Mode

If running in dev mode, captcha is bypassed:

```javascript
// In server/index.js
const isDev = process.env.NODE_ENV === 'development';
```

Set environment variable:
```bash
NODE_ENV=development npm start
```

---

## 📝 Report Issues

When reporting bugs, include:
1. Browser & version (Chrome 120, Firefox 115, etc.)
2. Device (Desktop/Mobile, OS)
3. Console logs (screenshot or copy/paste)
4. Steps to reproduce
5. Expected vs actual behavior

---

## ✅ Success Criteria

Test passes when:
- [x] Can spawn with custom name
- [x] Name appears in leaderboard
- [x] Can select own pieces
- [x] Can move pieces to legal squares
- [x] UI is readable (white text, color squares)
- [x] Online count shows correctly
- [x] Board colors are purple theme

---

**Last Updated:** Current session
**Status:** 🟡 Debugging in progress