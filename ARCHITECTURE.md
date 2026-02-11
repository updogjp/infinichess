# Xess Architecture Documentation

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         CLIENT                              │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │  Rendering   │  │    Input     │  │   Networking    │   │
│  │  (Canvas)    │◄─┤  Handling    │◄─┤  (WebSocket)    │   │
│  └──────┬───────┘  └──────────────┘  └────────┬────────┘   │
│         │                                       │           │
│         ▼                                       ▼           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Game State (board[][] )                 │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ WebSocket (Binary Protocol)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                         SERVER                              │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │  HTTP Server │  │   WS Server  │  │  Game Logic     │   │
│  │  (uWS.App)   │  │  (uWS.App)   │  │                 │   │
│  └──────────────┘  └──────┬───────┘  └─────────────────┘   │
│                           │                                 │
│                           ▼                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Global State                            │   │
│  │  ┌──────────┐  ┌──────────┐  ┌─────────────────┐   │   │
│  │  │  board   │  │  teams   │  │    clients      │   │   │
│  │  │  [64][64]│  │  [64][64]│  │  {id: ws}       │   │   │
│  │  └──────────┘  └──────────┘  └─────────────────┘   │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Client Architecture

### Module Dependencies

```
index.html
    ├── shared/constants.js (shared)
    ├── client/input.js
    │       └── Depends on: constants, networking
    ├── client/client.js
    │       └── Depends on: constants, input, networking
    └── client/networking.js
            └── Depends on: constants
```

### Rendering Pipeline

```
requestAnimationFrame
    │
    ├── Update Camera Position
    │   ├── Keyboard/Mobile input
    │   └── Zoom controls
    │
    ├── Calculate Visible Range
    │   └── Viewport culling (only render visible squares)
    │
    ├── Render Background
    │   └── Chess board pattern
    │
    ├── Render Legal Moves
    │   └── Semi-transparent dots
    │
    ├── Render Pieces
    │   ├── Neutral pieces (white sprites)
    │   └── Player pieces (tinted sprites)
    │       └── Interpolation for smooth movement
    │
    ├── Render UI Overlays
    │   ├── Move cooldown indicator
    │   ├── Game over screen
    │   └── Minimap
    │
    └── Render Mobile Controls
        └── Joystick + buttons
```

### State Management

Client maintains several key state variables:

```javascript
// Game State
const board[64][64]      // Piece types (0-6)
const teams[64][64]      // Team ownership (0 = neutral, 1+ = player IDs)
let selfId               // Current player's ID

// UI State
let selectedSquareX/Y    // Currently selected piece
let legalMoves[]         // Valid moves for selected piece
let curMoveCooldown      // Time until next move allowed
let gameOver             // Whether player is dead

// Camera State
let camera = {x, y, scale}  // View transform
let interpolatingPieces{}   // Pieces currently animating
```

## Server Architecture

### Event Loop

```
uWebSockets.App
    │
    ├── HTTP Routes
    │   ├── GET /           → index.html
    │   ├── GET /client/*   → Static assets
    │   └── GET /server/*   → Blocked
    │
    └── WebSocket /*
        ├── onOpen
        │   ├── Generate ID
        │   ├── Subscribe to 'global' channel
        │   └── Send full board state
        │
        ├── onMessage
        │   ├── Captcha verification (first message)
        │   ├── Move validation
        │   ├── Chat handling
        │   └── State updates
        │
        └── onClose
            ├── Remove from clients
            └── Neutralize player's pieces
```

### Game Loop Intervals

```javascript
// Piece spawn (every 300ms)
if (board not too full) {
    spawnRandomNeutralPiece()
}

// Neutralize disconnected players (every 440ms)
for each disconnectedTeam {
    convertTeamToNeutral()
    broadcastNeutralizeMessage()
}

// Count filled squares (every tick)
updateFilledSquaresCount()

// Cleanup captcha keys (every 2 min)
removeExpiredCaptchaKeys()

// Reset rate limits (every 20s)
clearIpRateLimits()
```

### Global State

```javascript
// Core game state
global.board[64][64]     // Piece types per square
global.teams[64][64]     // Team IDs per square

// Player management
global.clients{}         // Map: playerId → WebSocket
global.leaderboard{}     // Map: playerId → killCount

// Rate limiting
let connectedIps{}       // Currently connected IPs
let servedIps{}          // HTTP request rate limit
let fileServedIps{}      // File request rate limit

// Disconnection handling
let teamsToNeutralize[]  // Teams to convert to neutral
```

## Network Protocol

### Message Types by Length

| Byte Length | Type | Direction | Description |
|-------------|------|-----------|-------------|
| 0 | Join | C→S | Request king spawn |
| 4 | Chat | C→S | Chat message (after magic bytes) |
| 8 | Move | C→S | Piece movement |
| 8 | SetSquare | S→C | Single square update |
| 10 | MoveConfirm | S→C | Piece movement broadcast |
| Variable | BoardState | S→C | Initial full board |
| Variable | Chat | S→C | Chat broadcast |
| Variable | Leaderboard | S→C | Kill rankings |
| Variable | Neutralize | S→C | Player disconnected |

### Message Parsing Strategy

```javascript
// Server (index.js)
message: (ws, data) => {
    const u8 = new Uint8Array(data)
    
    // First check for chat magic bytes
    if(u8[0] === 0xf7 && u8[1] === 0xb7) {
        handleChat(u8)
        return
    }
    
    // Then check by length
    if(data.byteLength === 8) {
        handleMove(data)  // 4 Uint16s
    } else if(data.byteLength === 0) {
        handleJoin()      // Empty = join request
    }
}

// Client (networking.js)
ws.onmessage = (data) => {
    const msg = new Uint16Array(data.data)
    
    // Check magic numbers first
    if(msg[0] === 64535 && msg[1] === 12345) {
        handleNeutralize(msg)
    } else if(msg[0] === 47095) {
        handleChat(msg)
    } else if(msg[0] === 48027) {
        handleLeaderboard(msg)
    }
    // Then check by length
    else if(msg.byteLength > 10) {
        handleBoardState(msg)
    } else if(msg.byteLength === 10) {
        handleMove(msg)
    } else if(msg.byteLength === 8) {
        handleSetSquare(msg)
    }
}
```

## Data Flow: Move Lifecycle

```
User Input
    │
    ▼
┌─────────────────┐
│  Client Input   │  Mouse click/drag on canvas
│   Handling      │  Calculate grid coordinates
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Move Request   │  Validate client-side (visual only)
│   Generation    │  Send Uint16Array[startX, startY, endX, endY]
└────────┬────────┘
         │ WebSocket
         ▼
┌─────────────────┐
│  Server Receive │  Parse binary message
│                 │  Validate move cooldown
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Authorization  │  Check if player owns piece
│   Check         │  Check if within bounds
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Move Legality  │  Call generateLegalMoves()
│   Validation    │  Verify destination in legal moves
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  State Update   │  Update board[][] and teams[][]
│                 │  Handle captures and conversions
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Broadcast      │  Send Uint16Array to all clients
│                 │  via publish('global')
└────────┬────────┘
         │ WebSocket
         ▼
┌─────────────────┐
│  Client Receive │  Update local board state
│   & Render      │  Trigger animation/interpolation
└─────────────────┘
```

## Security Model

### Trust Boundaries

```
┌────────────────────────────────────────────────────────┐
│                        UNTRUSTED                       │
│  ┌──────────────────────────────────────────────────┐  │
│  │                    CLIENT                        │  │
│  │  • Can only request moves                        │  │
│  │  • All moves validated server-side               │  │
│  │  • Rate limited (3 messages / 10s for chat)      │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────┬───────────────────────────────┘
                         │ WebSocket
                         ▼
┌────────────────────────────────────────────────────────┐
│                        TRUSTED                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │                    SERVER                        │  │
│  │  • Authoritative game state                      │  │
│  │  • Validates all moves                           │  │
│  │  • Rate limiting per IP                          │  │
│  │  • Captcha verification required                 │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

### Validation Layers

1. **Connection Level**
   - IP rate limiting (1 connection per IP)
   - Captcha verification before game access

2. **Message Level**
   - Byte length validation
   - Magic number checks for typed messages
   - Bounds checking on coordinates

3. **Game Logic Level**
   - Move cooldown enforcement
   - Piece ownership verification
   - Legal move validation using shared rules
   - Team ID matching

### Rate Limits

```javascript
// Connection rate limit
if(connectedIps[ip]) rejectConnection()

// Move cooldown
if(now - ws.lastMovedTime < moveCooldown) rejectMove()

// Chat rate limit
if(chatMsgsLast5s > 3) rejectChat()

// HTTP rate limits
if(servedIps[ip] > 3) rejectRequest()  // Main page
if(fileServedIps[ip] > 25) rejectRequest()  // Assets
```

## Performance Characteristics

### Server
- **Memory**: ~20MB base + ~10KB per connected player
- **CPU**: Game logic is O(1) per move, O(boardW*boardH) for spawner
- **Network**: ~8 bytes per move, ~8KB initial sync

### Client
- **Render**: 60 FPS with viewport culling (renders ~50-100 squares max)
- **Memory**: ~5MB for images + canvas buffers
- **Network**: Minimal (binary protocol)

### Optimizations

1. **Viewport Culling**: Only render visible squares
2. **Binary Protocol**: Minimal bandwidth vs JSON
3. **uWebSockets**: C++ WebSocket implementation
4. **Uint16Array**: Efficient binary data handling
5. **Interpolation**: Smooth client-side animation
6. **Minimap Caching**: Renders once every 300ms

## Scaling Considerations

### Current Limits
- Single Node.js process
- 64x64 board (4096 squares)
- ~1000 concurrent connections (theoretical)

### Potential Bottlenecks
1. **Single process**: CPU bound with high player counts
2. **Memory**: board[][] arrays scale with square count
3. **Broadcast**: All moves broadcast to all players

### Future Scaling Options
1. **Horizontal**: Shard by board regions (complex with moving pieces)
2. **Spatial Partitioning**: Only send updates for visible regions
3. **Web Workers**: Offload game logic from main thread
4. **Redis**: Share state across multiple server instances

## File Size Budget

```
Client JS:    ~70KB total
  client.js:      ~23KB
  input.js:       ~7KB
  networking.js:  ~8KB
  constants.js:   ~4KB

Assets:       ~150KB
  6 piece images: ~50KB
  5 audio files:  ~65KB
  CSS:            ~8KB
  HTML:           ~1KB

Total initial: ~220KB
```
