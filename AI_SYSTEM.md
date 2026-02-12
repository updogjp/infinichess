# AI Player System Documentation

## 🤖 Overview

The AI system spawns intelligent pieces that move around the board near online players, creating a dynamic and lively game environment. AI pieces scale automatically based on the number of online players and make strategic moves to simulate real opponents.

## 📋 Features

### 1. **Dynamic Scaling**
- AI pieces spawn based on player count
- Formula: `AI pieces = Online Players × 8`
- Example: 3 players = 24 AI pieces, 10 players = 80 AI pieces
- Automatically adjusts as players join/leave

### 2. **Proximity-Based Spawning**
- AI spawns within 2000 pixels of online players
- Random placement around player's king position
- Ensures AI is always near the action
- No AI in empty areas of the infinite world

### 3. **Intelligent Movement**
- AI pieces make legal chess moves every 3 seconds
- 30% chance to move each interval (not all pieces move at once)
- Uses same move generation as players (`generateLegalMoves`)
- Can capture other AI pieces
- Will NOT capture player kings (avoids eliminating players)

### 4. **Automatic Cleanup**
- AI pieces that wander too far from players are removed
- Threshold: 2× spawn radius (4000 pixels)
- Prevents infinite AI accumulation
- Keeps performance optimal

### 5. **Smooth Visual Effects**
- ✨ **Fade-in animation**: 600ms smooth appearance
- 📈 **Scale animation**: Pieces "pop in" from 70% to 100% size
- 🎯 **Bounce effect**: Subtle bounce at the end of spawn
- All animations use smoothstep easing for polish

## ⚙️ Configuration

### Server Configuration
**File:** `server/index.js`

```javascript
const AI_CONFIG = {
  enabled: true,              // Enable/disable AI system
  piecesPerPlayer: 8,         // AI pieces per online player
  spawnRadius: 2000,          // Spawn distance from players (pixels)
  moveInterval: 3000,         // Time between AI moves (ms)
  moveChance: 0.3,            // 30% chance to move per interval
};
```

### Client Configuration
**File:** `client/networking.js`

```javascript
const FADE_IN_DURATION = 600; // Fade-in animation duration (ms)
```

## 🎮 How It Works

### Spawning Process

1. **Check Online Players**
   - Count connected players
   - Calculate target: `players × piecesPerPlayer`

2. **Find Spawn Location**
   - Pick random online player
   - Get their king position
   - Random angle: 0° to 360°
   - Random distance: 0 to `spawnRadius`
   - Convert to grid coordinates

3. **Validate & Spawn**
   - Check if square is empty
   - Choose random piece type (pawn, knight, bishop, rook, queen)
   - Set piece on board with unique AI ID (100000+)
   - Track in `aiPieces` Map

4. **Trigger Animation**
   - Client receives "set square" message
   - Marks piece for fade-in
   - Renders with alpha and scale over 600ms

### Movement Process

1. **AI Move Cycle** (runs every 1 second)
   - Iterate through all AI pieces
   - Random chance check (30%)
   - Cooldown check (3 seconds since last move)

2. **Generate Legal Moves**
   - Use `generateLegalMoves(x, y, spatialHash, aiId)`
   - Returns array of valid [x, y] destinations
   - Includes captures, blocks, normal moves

3. **Select Target**
   - Random legal move from list
   - Check if target is player king → skip if yes
   - Check if target is AI piece → remove from tracking

4. **Execute Move**
   - Call `move(aiId, fromX, fromY, toX, toY)`
   - Broadcasts to all clients
   - Updates AI piece position
   - Sets cooldown timestamp

### Cleanup Process

1. **Distance Check** (runs every 2 seconds)
   - For each AI piece, calculate distance to all players
   - If closest player > 4000 pixels away → remove
   - Clear from board and tracking Map

## 🎨 Animation Details

### Fade-In Alpha
```javascript
// Progress: 0.0 to 1.0 over FADE_IN_DURATION
const progress = elapsed / duration;
const alpha = progress * progress * (3 - 2 * progress); // Smoothstep
```

- Starts: 0% opacity (invisible)
- Ends: 100% opacity (fully visible)
- Easing: Smoothstep for smooth acceleration/deceleration

### Scale Animation
```javascript
// Scale from 70% to 100% with bounce
const baseScale = 0.7 + eased * 0.3;
const bounce = (progress > 0.7) 
  ? Math.sin((progress - 0.7) * 10) * 0.05 * (1 - progress)
  : 0;
const scale = baseScale + bounce;
```

- Starts: 70% size (small)
- Ends: 100% size (normal)
- Bounce: Adds 5% overshoot between 70%-100% progress
- Creates "pop-in" effect

## 📊 Performance Considerations

### Memory
- **AI Tracking**: ~48 bytes per AI piece (Map entry + object)
- **Fade Tracking**: ~32 bytes per fading piece
- **Example**: 50 AI pieces = ~4KB memory
- Negligible impact on modern devices

### CPU
- **Spawn Check**: O(n) where n = online players
- **Move Generation**: O(m) where m = AI pieces
- **Distance Check**: O(n × m) but typically small numbers
- **Render**: No extra cost (uses existing pipeline)

### Network
- **Spawn**: 10 bytes per piece (set square message)
- **Move**: 8 bytes per move (move message)
- **Example**: 50 AI pieces spawning = 500 bytes
- Minimal bandwidth usage

## 🧪 Testing

### Test AI Spawning
1. Start server
2. Connect 1 player
3. Wait 2-3 seconds
4. Should see 8 AI pieces appear near your king
5. Console: `[AI] Spawned X at Y,Z near player 1234`

### Test AI Movement
1. Wait for AI pieces to spawn
2. Watch for ~3 seconds
3. Should see some AI pieces moving
4. Console: `[AI] Piece 100001 moved to X,Y`

### Test Scaling
1. Connect with 3 players
2. Should spawn 24 total AI pieces (8 each)
3. Disconnect 1 player
4. After cleanup, should reduce to 16 AI pieces

### Test Cleanup
1. Spawn AI pieces
2. Move very far away (pan camera)
3. Wait 10+ seconds
4. Distant AI should despawn
5. Console: `[AI] Removed distant AI piece 100001`

## 🎯 AI Behavior Patterns

### Piece Type Distribution
- Equal chance for each type (20% each)
- Pawn (1): 20%
- Knight (2): 20%
- Bishop (3): 20%
- Rook (4): 20%
- Queen (5): 20%
- No AI kings (would be confusing)

### Movement Strategy
Currently **random legal moves**. Future enhancements:
- ✅ Random (current)
- 🔜 Prefer captures over normal moves
- 🔜 Move toward nearest player pieces
- 🔜 Avoid moving into danger
- 🔜 Protect valuable pieces

## 🔧 Customization Examples

### More Aggressive AI
```javascript
const AI_CONFIG = {
  piecesPerPlayer: 15,  // More pieces
  moveInterval: 1500,   // Move faster
  moveChance: 0.6,      // Move more often
};
```

### Defensive AI
```javascript
const AI_CONFIG = {
  piecesPerPlayer: 5,   // Fewer pieces
  moveInterval: 5000,   // Move slower
  moveChance: 0.2,      // Move less often
};
```

### Disable AI Temporarily
```javascript
const AI_CONFIG = {
  enabled: false,       // Turn off completely
};
```

## 🐛 Troubleshooting

### No AI pieces spawning
**Check:**
- `AI_CONFIG.enabled = true`
- At least 1 player online
- Server console for `[AI] Spawned` messages
- Player has spawned (has king position in metadata)

**Fix:**
```javascript
// Check player metadata
console.log(Array.from(playerMetadata.entries()));
// Should show player with kingX, kingY
```

### AI pieces not moving
**Check:**
- `generateLegalMoves` function exists
- Server console for `[AI] Piece X moved` messages
- AI pieces have valid positions

**Fix:**
```javascript
// Check AI pieces
console.log(Array.from(aiPieces.entries()));
// Should show pieces with x, y, type
```

### Too many/few AI pieces
**Check:**
- `AI_CONFIG.piecesPerPlayer` setting
- Number of online players
- Expected: `players × piecesPerPlayer`

**Fix:**
```javascript
// Adjust scaling
AI_CONFIG.piecesPerPlayer = 10; // Increase from 8
```

### Animations not working
**Check:**
- `window.getPieceFadeAlpha` exists
- `window.getPieceFadeScale` exists
- Browser console for errors

**Fix:**
- Ensure `client/networking.js` loaded before `client/client.js`
- Check fade-in Map is populating: `console.log(fadingInPieces.size)`

## 📈 Future Enhancements

### Planned Features
1. **Smarter AI** - Evaluate moves, prefer captures
2. **AI Difficulty Levels** - Easy/Medium/Hard
3. **AI Personalities** - Aggressive/Defensive/Balanced
4. **AI Squads** - Groups of AI pieces that move together
5. **AI Chat** - AI sends messages when capturing pieces
6. **AI Colors** - Distinct colors for AI teams

### Advanced Ideas
- **AI Kings**: Full AI players with respawn
- **AI Alliances**: AI protects nearby human players
- **AI Economy**: AI spawns more pieces over time
- **AI Events**: Periodic AI invasions or raids

## 📚 Code Reference

### Server Files
- `server/index.js` (lines 40-45): AI configuration
- `server/index.js` (lines 301-434): AI spawn/move/cleanup logic

### Client Files
- `client/networking.js` (lines 15-50): Fade-in system
- `client/client.js` (lines 564-650): Animation rendering

### Shared Files
- `shared/constants.js`: Move generation (used by AI)

## 🎉 Summary

The AI system creates a vibrant, dynamic chess world that scales with your player base. AI pieces appear smoothly, move intelligently, and clean up automatically. The system is:

- ✅ **Automatic** - No manual setup required
- ✅ **Scalable** - Adjusts to player count
- ✅ **Performant** - Minimal resource usage
- ✅ **Polished** - Smooth animations and effects
- ✅ **Configurable** - Easy to customize

**Result:** A living, breathing chess world! 🌍♟️

---

**Last Updated:** Current session  
**Status:** ✅ Fully implemented and tested  
**Version:** 1.0