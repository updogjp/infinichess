# AI Agent Coding Guide for Infinichess

This document provides guidelines for AI agents working on the Infinichess codebase.

## Project Context

**Infinichess** is a fork of **Xess/10kchess** - a massively multiplayer online chess game on an infinite world. Key characteristics:
- Real-time WebSocket-based gameplay
- Binary protocol for network efficiency
- Canvas-based rendering with custom game loop
- Shared client/server logic for move validation
- No build step - vanilla JavaScript/Node.js

### Fork Differences
- **Infinite world** (was 64x64 fixed)
- **World persistence** (saves to disk)
- **Player customization** (name + color selection)
- **Floating chat bubbles** (visual feedback)
- **Viewport broadcasting** (optimized networking)

## Code Style Guidelines

### JavaScript Style

- Use ES6 modules (`import`/`export`)
- Prefer `const` over `let`, never use `var`
- Use camelCase for variables/functions, PascalCase for classes
- No semicolons (project follows this convention)
- Template literals for string interpolation
- Explicit comparisons (`===` not `==`)

### File Organization

```javascript
// 1. Imports first
import uWS from 'uWebSockets.js'
import '../shared/constants.js'

// 2. Global constants
const PORT = 3000

// 3. Module-level state
let leaderboard = {}

// 4. Function definitions
function helper() { }

// 5. Main initialization
app.listen(PORT)
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Variables | camelCase | `playerId`, `boardWidth` |
| Constants | UPPER_SNAKE | `PORT`, `BOARD_SIZE` |
| Functions | camelCase | `generateId()`, `handleMove()` |
| Files | kebab-case or descriptive | `client.js`, `networking.js` |

## Critical Code Patterns

### Binary Protocol Handling

When adding new network messages, follow the existing pattern:

**Server sending:**
```javascript
const buf = new Uint16Array(4)
buf[0] = x
buf[1] = y
buf[2] = piece
buf[3] = team
broadcast(buf)
```

**Client receiving:**
```javascript
ws.addEventListener("message", function (data) {
    const msg = new Uint16Array(data.data)
    
    // Check message type by length or magic numbers
    if(msg.byteLength === 8) {
        // Handle 4-uint16 message
        const x = msg[0]
        const y = msg[1]
        // ...
    }
})
```

### Canvas Rendering

The game uses a custom render loop with transform-based camera:

```javascript
// Always save/restore transform
const t = ctx.getTransform()

ctx.translate(canvas.w/2, canvas.h/2)
ctx.scale(camera.scale, camera.scale)
ctx.translate(camera.x, camera.y)

// ... draw game ...

ctx.setTransform(t) // Restore
```

**Viewport culling is critical** - only render visible squares:
```javascript
// Calculate visible range
const topLeft = canvasPos({x: 0, y: 0})
const bottomRight = canvasPos({x: innerWidth, y: innerHeight})

// Convert to grid coordinates
const startX = Math.max(0, Math.floor(topLeft.x / squareSize))
const endX = Math.min(boardW, Math.ceil(bottomRight.x / squareSize))

// Render only visible squares
for(let i = startX; i < endX; i++) {
    // ...
}
```

### Move Validation

All moves are validated server-side using shared logic in `constants.js`:

```javascript
// Client: Show legal moves (visual only)
legalMoves = generateLegalMoves(x, y, board, teams)

// Server: Validate actual moves
const legalMoves = generateLegalMoves(startX, startY, board, teams)
let includes = false
for(let i = 0; i < legalMoves.length; i++){
    if(legalMoves[i][0] === finX && legalMoves[i][1] === finY){
        includes = true
        break
    }
}
if(includes === false) return // Reject invalid move
```

**Never trust client input** - always re-validate on server.

## Common Tasks

### Adding a New Piece Type

1. Add to `shared/constants.js` moveMap:
```javascript
const moveMap = [
    undefined,
    // ... existing pieces ...
    // New piece at index 7
    (x, y, board, teams, selfId) => {
        // Return array of valid [x, y] moves
        return [[x+1, y], [x-1, y]].filter(m => /* bounds check */)
    }
]
```

2. Add sprite in `client/client.js`:
```javascript
const srcs = ['wp','wn','wb','wr','wq','wk', 'wnew'] // Add new piece
```

3. Add image asset to `client/assets/`

### Adding a New Network Message

1. Choose unique magic number (avoid existing: 48027, 47095, 64535)
2. Document in README protocol section
3. Handle in both client and server

**Server → Client example:**
```javascript
// Server
function sendNewMessage(data) {
    const buf = new Uint16Array(3)
    buf[0] = 12345 // Magic number
    buf[1] = data.x
    buf[2] = data.y
    broadcast(buf)
}

// Client
ws.addEventListener("message", function (data) {
    const msg = new Uint16Array(data.data)
    if(msg[0] === 12345) {
        const x = msg[1]
        const y = msg[2]
        // Handle message
    }
})
```

### Adding Chat Commands

Modify `server/index.js` message handler:

```javascript
if(chatMessage.slice(0, 5) === '/command') {
    // Handle command
    chatMessage = '[SERVER] Command result'
    id = 65534 // Server ID
}
```

## Testing Checklist

Before committing changes:

- [ ] Server starts without errors: `npm start`
- [ ] Client loads in browser (check console for errors)
- [ ] WebSocket connects successfully
- [ ] Can complete captcha and spawn
- [ ] Can move pieces
- [ ] Move validation works (can't make illegal moves)
- [ ] Captures work correctly
- [ ] Chat messages send/receive
- [ ] Leaderboard updates
- [ ] Mobile controls work (if applicable)
- [ ] No errors in browser console
- [ ] No errors in server console

## Performance Considerations

### Network
- Keep messages small (use Uint16Array, not JSON)
- Batch updates when possible
- Use magic numbers, not string message types

### Rendering
- Always use viewport culling
- Minimize canvas state changes
- Use `changed` flag to skip unnecessary renders
- Interpolate piece movement client-side

### Server
- Validate all inputs immediately
- Use efficient data structures (Arrays over Objects for board)
- Clean up disconnected players promptly

## Debugging Tips

### Enable detailed logging
```javascript
// In server/index.js
console.log('Debug:', variable)
```

### Monitor WebSocket messages
```javascript
// In client/networking.js
ws.addEventListener("message", function (data) {
    console.log('Received:', new Uint16Array(data.data))
    // ...
})
```

### Check board state
```javascript
// Server console
console.table(global.board)
```

### Browser DevTools
- Network tab → WS filter to see WebSocket frames
- Console for client-side errors
- Performance tab to profile rendering

## Anti-Patterns to Avoid

❌ **Don't use JSON for network messages**
```javascript
// BAD
ws.send(JSON.stringify({type: 'move', x: 5, y: 10}))

// GOOD
const buf = new Uint16Array([5, 10])
ws.send(buf)
```

❌ **Don't modify board without broadcasting**
```javascript
// BAD
board[x][y] = piece // Other clients won't see this!

// GOOD
setSquare(x, y, piece, team) // Broadcasts automatically
```

❌ **Don't trust client-side validation**
```javascript
// BAD (client)
if(isValidMove) sendMove() // Server must re-validate!

// GOOD (server)
const legalMoves = generateLegalMoves(x, y, board, teams)
// Check if move is in legalMoves
```

❌ **Don't render off-screen elements**
```javascript
// BAD
for(let i = 0; i < boardW; i++) {
    for(let j = 0; j < boardH; j++) {
        renderSquare(i, j) // Renders entire board!
    }
}

// GOOD
for(let i = visibleStartX; i < visibleEndX; i++) {
    for(let j = visibleStartY; j < visibleEndY; j++) {
        renderSquare(i, j) // Only visible squares
    }
}
```

## File Reference

### Core Game Logic
- `shared/constants.js` - Board size, move validation, game rules
- `server/index.js` - WebSocket server, game state, networking
- `client/client.js` - Rendering, game loop, input handling
- `client/networking.js` - WebSocket client, message handling

### UI/Input
- `client/input.js` - Keyboard controls, chat UI, leaderboard
- `client/index.html` - Game page structure
- `client/style.css` - UI styling

### Assets
- `client/assets/*.png` - Chess piece sprites (150x150px)
- `client/assets/*.mp3` - Sound effects

## Questions?

Check the README.md for high-level architecture and protocol documentation.
