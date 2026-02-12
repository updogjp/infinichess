# Player Name Fix - "greg" Not Showing in Leaderboard

## Problem
Player was typing "greg" as their designation (name) but the leaderboard was showing "mediumaquamarine" (the auto-generated color name) instead.

## Root Causes

### 1. Wrong CSS Class Selector
**Issue:** JavaScript was looking for `.color-option` but HTML uses `.color-swatch`

```javascript
// BEFORE (broken)
const colorOptions = document.querySelectorAll(".color-option");

// AFTER (fixed)
const colorOptions = document.querySelectorAll(".color-swatch");
```

**Impact:** Color selection wasn't working, so player color wasn't being set properly.

**File:** `client/networking.js` line ~274

---

### 2. Connection Check Blocking Message Send
**Issue:** `sendPlayerInfo()` had early return if not connected

```javascript
// BEFORE (broken)
function sendPlayerInfo() {
  if (!connected) return; // ❌ Blocks sending if WS not ready
  // ...
  send(buf);
}

// AFTER (fixed)
function sendPlayerInfo() {
  // No connection check - let send() handle queuing
  // ...
  send(buf); // ✅ Will queue if not connected yet
}
```

**Impact:** Player info message was never sent because the check happened before the WebSocket fully connected.

**File:** `client/networking.js` line ~356

---

### 3. Wrong Buffer Size Calculation
**Issue:** Buffer size calculation was incorrect

```javascript
// BEFORE (broken)
const buf = new Uint8Array(4 + nameBuf.length + 3);

// AFTER (fixed)
const buf = new Uint8Array(5 + nameBuf.length);
```

**Breakdown:**
- 1 byte: Magic number (55551)
- 1 byte: Name length
- 3 bytes: RGB color (r, g, b)
- N bytes: Name string
- **Total:** 5 + nameBuf.length ✅

**File:** `client/networking.js` line ~359

---

### 4. Wrong Initial Color
**Issue:** Initial color was `#FF0000` (red) but default swatch is `#FFB3BA` (pastel pink)

```javascript
// BEFORE (broken)
window.playerColor = "#FF0000";

// AFTER (fixed)
window.playerColor = "#FFB3BA"; // Matches first swatch
```

**Impact:** Color mismatch between default selection and actual value.

**File:** `client/networking.js` line ~6

---

## How It Works Now

### Flow:
1. **Captcha completes** → Player setup modal shown
2. **User types name** ("greg") → `window.playerName = "greg"`
3. **User selects color** → `window.playerColor = "#FFB3BA"`
4. **User clicks START** → `sendPlayerInfo()` called
5. **Message queued/sent** → Uses existing `send()` queue system
6. **Server receives** → Decodes name from byte array
7. **Server stores** → `playerMetadata.set(ws.id, { name: "greg", ... })`
8. **Leaderboard updates** → Shows "greg" instead of "mediumaquamarine"

### Message Format:
```
Byte 0:     55551 (magic number for player info)
Byte 1:     Name length (e.g., 4 for "greg")
Bytes 2-4:  RGB color (r, g, b)
Bytes 5+:   UTF-8 encoded name string
```

### Example:
For name "greg" with color `#FFB3BA`:
```javascript
[
  55551,  // Magic number (stored as single byte 0xD8FF -> 255)
  4,      // Name length
  255,    // R
  179,    // G
  186,    // B
  103,    // 'g'
  114,    // 'r'
  101,    // 'e'
  103     // 'g'
]
```

---

## Testing

### Before Fix:
```
[LEADERBOARD] Sending to 1 players: mediumaquamarine(0)
```

### After Fix:
```
🎮 Initializing player setup modal
🎮 Found color swatches: 8
🚀 Start button clicked: {
  playerName: 'greg',
  playerColor: '#FFB3BA',
  connected: true
}
📤 Sending player info: {
  name: 'greg',
  color: '#FFB3BA',
  rgb: { r: 255, g: 179, b: 186 },
  bufferLength: 9,
  bufferContent: [255, 4, 255, 179, 186, 103, 114, 101, 103]
}
[INFO] Player 1 sent name info - Raw: "greg", Length: 4, Color: rgb(255,179,186)
[SUCCESS] Player 1 set name: "greg", color: rgb(255,179,186)
[LEADERBOARD] Sending to 1 players: greg(0)
```

---

## Files Modified

1. **client/networking.js**
   - Fixed color selector class name (`.color-option` → `.color-swatch`)
   - Removed connection check from `sendPlayerInfo()`
   - Fixed buffer size calculation (4+N+3 → 5+N)
   - Set correct initial color (#FF0000 → #FFB3BA)
   - Added debug logging for player setup flow

---

## Verification Checklist

- [x] Color swatches are clickable and update preview
- [x] Name input updates preview in real-time
- [x] Start button sends player info message
- [x] Server receives and logs player name correctly
- [x] Leaderboard displays player name (not color name)
- [x] Stats panel shows correct player name
- [x] Player color matches selected swatch

---

## Additional Logging Added

To help debug issues, added console logs at key points:

```javascript
// When setup modal opens
console.log("🎮 Initializing player setup modal");
console.log("🎮 Found color swatches:", colorOptions.length);

// When start button clicked
console.log("🚀 Start button clicked:", {
  playerName: window.playerName,
  playerColor: window.playerColor,
  connected: connected
});

// When sending player info
console.log("📤 Sending player info:", {
  name: window.playerName,
  color: window.playerColor,
  rgb: color,
  bufferLength: buf.length,
  bufferContent: Array.from(buf)
});
```

Server-side logs already exist:
```javascript
console.log(`[INFO] Player ${ws.id} sent name info - Raw: "${name}", ...`);
console.log(`[SUCCESS] Player ${ws.id} set name: "${name}", ...`);
```
