# Debug Fixes Applied - Piece Movement & Leaderboard Issues

## 🐛 Issues Addressed

### 1. Pieces Not Moving
**Problem:** Players could spawn but couldn't select or move pieces.

**Root Causes Identified:**
1. Missing `changed = true` flag when piece selected
2. Inconsistent move cooldown values (200ms vs 1500ms)
3. Insufficient debug logging to diagnose issues
4. Potential coordinate transformation issues

**Fixes Applied:**

#### A. Added Comprehensive Debug Logging
**File:** `client/client.js`

```javascript
// On mouse down
console.log("🖱️ Mouse down at screen:", e.x, e.y, "world:", mousePos);
console.log("🎯 Clicked square:", squareX, squareY);
console.log("🔍 Checking square:", squareX, squareY, "Piece type:", piece.type, "Piece team:", piece.team, "Self ID:", selfId);

// On piece selection
console.log("✓ Selected piece at", squareX, squareY, "Legal moves:", legalMoves.length);

// On move attempt
console.log("✅ Moving piece from", selectedSquareX, selectedSquareY, "to", squareX, squareY);
console.log("❌ Illegal move to", newX, newY);
```

**What to look for in console:**
- `Self ID: -1` → Player not spawned yet
- `Piece team: 0` → Empty square
- `Piece team: 1234, Self ID: 5678` → Not your piece
- `✓ Selected piece` → Successful selection
- `✅ Moving piece` → Move command sent

#### B. Fixed Render Trigger
**File:** `client/client.js` (line ~184)

```javascript
if (piece.type !== 0 && piece.team === selfId) {
  selectedSquareX = squareX;
  selectedSquareY = squareY;
  legalMoves = generateLegalMoves(...);
  draggingSelected = true;
  changed = true; // ← ADDED: Force re-render to show selection
}
```

**Why:** Without `changed = true`, the selection highlight wouldn't render until the next frame.

#### C. Fixed Move Cooldown Consistency
**File:** `client/client.js` (lines 151, 268)

```javascript
// BEFORE
curMoveCooldown = 200; // Hardcoded 200ms

// AFTER
curMoveCooldown = window.moveCooldown || 1500; // Use global setting (1.5s)
```

**Why:** Inconsistent cooldown could cause desync between client visual and actual cooldown.

#### D. Removed Unnecessary Transform Manipulation
**File:** `client/client.js` (line ~76)

```javascript
// REMOVED: These lines were redundant
// const t = ctx.getTransform();
// ctx.translate(canvas.w / 2, canvas.h / 2);
// ctx.scale(camera.scale, camera.scale);
// ctx.translate(camera.x, camera.y);
mousePos = canvasPos({ x: e.x, y: e.y });
// ctx.setTransform(t);
```

**Why:** `canvasPos()` already handles coordinate transformation. Extra transforms caused incorrect calculations.

---

### 2. Username Not Appearing in Leaderboard
**Problem:** Player enters name during setup, but leaderboard shows "Player1234" or nothing.

**Root Causes Identified:**
1. `sendPlayerInfo()` returned early if not connected
2. Message queueing existed but wasn't used
3. No visibility into whether message was sent/received
4. Server might not initialize leaderboard entry

**Fixes Applied:**

#### A. Fixed Message Queue Logic
**File:** `client/networking.js` (line ~419)

```javascript
// BEFORE
function sendPlayerInfo() {
  if (!connected) return; // ← Message never sent if not connected yet!
  // ... send logic
}

// AFTER
function sendPlayerInfo() {
  // Removed early return - now uses send() which queues if needed
  const buf = new Uint8Array(5 + nameBuf.length);
  // ... build message
  send(buf); // This will queue if not connected, send immediately if connected
}
```

**Why:** WebSocket might not be connected when player clicks "Deploy". Message needs to queue.

#### B. Fixed Buffer Size Calculation
**File:** `client/networking.js` (line ~422)

```javascript
// BEFORE
const buf = new Uint8Array(4 + nameBuf.length + 3);

// AFTER
const buf = new Uint8Array(5 + nameBuf.length);
// Format: [magic_byte:1][name_length:1][r:1][g:1][b:1][name:N]
```

**Why:** Incorrect buffer size could cause truncation or extra bytes.

#### C. Added Comprehensive Logging (Client)
**File:** `client/networking.js`

```javascript
// Queue status
console.log("📦 Queuing message (not connected yet), length:", data.length);

// Connection event
console.log("✅ WebSocket connected, flushing", msgs.length, "queued messages");

// Send events
console.log("📤 Sending message, length:", data.length, "First bytes:", Array.from(data.slice(0, 5)));

// Player info
console.log("📤 Sending player info:", {
  name: playerName,
  color: playerColor,
  rgb: color,
  connected: connected,
  bufferLength: buf.length,
  bufferContent: Array.from(buf.slice(0, 10))
});
```

#### D. Added Server-Side Logging
**File:** `server/index.js`

```javascript
// Connection
console.log(`[CONNECT] Player ${ws.id} connected, initializing leaderboard`);

// Player info received
console.log(`[INFO] Player ${ws.id} sent name info - Raw: "${name}", Length: ${nameLength}, Color: rgb(${r},${g},${b})`);

// Player info processed
console.log(`[SUCCESS] Player ${ws.id} set name: "${name}", color: rgb(${r},${g},${b})`);

// Leaderboard broadcast
console.log(`[LEADERBOARD] Broadcasting update for player ${ws.id}`);
console.log(`[LEADERBOARD] Sending to ${Object.keys(clients).length} players:`, 
  leaderboardData.map(d => `${d.name}(${d.kills})`).join(", "));
```

#### E. Ensured Leaderboard Entry Exists
**File:** `server/index.js` (line ~595)

```javascript
// Initialize leaderboard entry if not exists
if (!leaderboard.has(ws.id)) {
  leaderboard.set(ws.id, 0);
}

// Broadcast updated leaderboard with new name
broadcastToAll(sendLeaderboard());
```

**Why:** Player must have leaderboard entry (even with 0 kills) to appear.

---

### 3. Chessboard Colors
**Problem:** User requested specific purple theme colors.

**Fix Applied:**
**File:** `client/client.js` (line ~231)

```javascript
// BEFORE
const colors = ["#000000", "#432FE9"]; // Black and Purple

// AFTER
const colors = ["#4F4096", "#3A2E6F"]; // Purple theme
```

**Result:** Chessboard now uses requested purple shades:
- Light squares: `#4F4096` (medium purple)
- Dark squares: `#3A2E6F` (dark purple)

---

## 🧪 Testing Instructions

### Test 1: Verify Piece Movement

1. **Open browser console (F12)**
2. **Start game and spawn**
3. **Click your king piece**
4. **Expected console output:**
   ```
   🖱️ Mouse down at screen: X Y world: {x, y}
   🎯 Clicked square: X Y Selected: undefined undefined
   🔍 Checking square: X Y Piece type: 6 Piece team: YOUR_ID Self ID: YOUR_ID
   ✓ Selected piece at X Y Legal moves: 8
   ```
5. **Click a legal move square**
6. **Expected console output:**
   ```
   🖱️ Mouse down at screen: X Y world: {x, y}
   🎯 Clicked square: DEST_X DEST_Y Selected: X Y
   ✅ Moving piece from X Y to DEST_X DEST_Y
   ```
7. **Piece should move to new location**

### Test 2: Verify Username in Leaderboard

1. **Open browser console (F12)**
2. **Complete captcha**
3. **Enter username "TestPlayer123"**
4. **Select a color**
5. **Click "INITIATE DEPLOYMENT"**
6. **Expected client console output:**
   ```
   🚀 Starting deployment: {playerName: "TestPlayer123", playerColor: "#FFB3BA"}
   📦 Queuing message (not connected yet), length: 20
   ✓ Player info sent/queued
   ✅ WebSocket connected, flushing 1 queued messages
   📤 Flushing queued message 1 of 1
   📤 Sending message, length: 20 First bytes: [223, 15, 255, 179, 186, ...]
   ```
7. **Expected server console output:**
   ```
   [CONNECT] Player 1234 connected, initializing leaderboard
   [INFO] Player 1234 sent name info - Raw: "TestPlayer123", Length: 15, Color: rgb(255,179,186)
   [SUCCESS] Player 1234 set name: "TestPlayer123", color: rgb(255,179,186)
   [LEADERBOARD] Broadcasting update for player 1234
   [LEADERBOARD] Sending to 1 players: TestPlayer123(0)
   ```
8. **Check leaderboard in-game:**
   - Should show: `🟥 TestPlayer123 [0]` (with colored square)
   - Text should be white (readable)

### Test 3: Verify Board Colors

1. **Look at chessboard squares**
2. **Should see purple theme:**
   - Light purple: `#4F4096`
   - Dark purple: `#3A2E6F`
3. **No black or bright blue squares**

---

## 🔍 Troubleshooting

### "Still can't move pieces"

**Check console for these specific errors:**

1. **`Self ID: -1`**
   - Player not spawned yet
   - Wait 1-2 seconds after clicking deploy
   - Check server logs for spawn message

2. **`spatialHash not available`**
   - Critical error - spatial hash not initialized
   - Refresh page
   - Check for JavaScript errors earlier in console

3. **`Piece team: 0` when clicking king**
   - King not in spatial hash
   - Check server sent viewport sync (message 55553)
   - Console should show: `🎮 Viewport sync received`

4. **Legal moves = 0**
   - Move generation failing
   - Check `shared/constants.js` loaded correctly
   - Ensure `generateLegalMoves` function exists

### "Username still not showing"

**Check message flow:**

1. **Client side:**
   - Look for: `📤 Sending player info:`
   - If missing: Check if `sendPlayerInfo()` was called
   - Check buffer content: Should show `[223, length, r, g, b, ...]`

2. **Server side:**
   - Look for: `[INFO] Player X sent name info`
   - If missing: Message not received - check WebSocket
   - Look for: `[SUCCESS] Player X set name`
   - If missing: Name sanitization might have failed

3. **Leaderboard update:**
   - Look for: `[LEADERBOARD] Sending to N players:`
   - Should include your name
   - Check client receives message (55553)

### "Console is too noisy"

The debug logs can be filtered:
- Chrome: Click "Default levels" dropdown, uncheck "Verbose"
- Firefox: Type "Moving" or "Selected" in filter box
- Or look for emoji: 🖱️ 🎯 ✅ ❌ to spot key events

---

## 🎯 Expected Behavior After Fixes

1. ✅ **Piece Selection:** Click piece → highlights, shows legal moves
2. ✅ **Piece Movement:** Click destination → piece moves smoothly
3. ✅ **Username Display:** Name appears in leaderboard with color square
4. ✅ **Board Colors:** Purple theme (#4F4096 / #3A2E6F)
5. ✅ **Comprehensive Logging:** Every action logged with emoji indicators
6. ✅ **Error Reporting:** Failed actions show ❌ with reason

---

## 📋 Files Modified in This Fix

1. **`client/client.js`**
   - Added debug logging throughout click handlers
   - Fixed `changed = true` on piece selection
   - Fixed move cooldown to use global value
   - Removed redundant coordinate transforms
   - Updated board colors

2. **`client/networking.js`**
   - Removed early return in `sendPlayerInfo()`
   - Fixed buffer size calculation
   - Added comprehensive logging for message queue
   - Added send/receive logging

3. **`server/index.js`**
   - Added connection logging
   - Added player info reception logging
   - Added leaderboard broadcast logging
   - Ensured leaderboard entry initialization

4. **Documentation:**
   - Created `TESTING_GUIDE.md`
   - Created this `DEBUG_FIXES.md`

---

## ✨ Verification Commands

Run these in browser console after deploying:

```javascript
// 1. Check player spawned
console.log("Self ID:", selfId, "Should be > 0");

// 2. Check spatial hash working
console.log("My pieces:", spatialHash.getAllPieces().filter(p => p.team === selfId));

// 3. Check king exists
const king = spatialHash.getAllPieces().find(p => p.type === 6 && p.team === selfId);
console.log("My king at:", king ? `${king.x}, ${king.y}` : "NOT FOUND");

// 4. Check username set
console.log("Name:", playerName, "Color:", playerColor);

// 5. Force render
changed = true;
```

---

**Status:** ✅ Fixes applied, ready for testing
**Next Steps:** Test piece movement and leaderboard display
**Rollback:** If issues persist, see `DEPLOYMENT_CHECKLIST.md` for rollback procedure