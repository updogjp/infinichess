# Quick Reference Guide

## Running the Project

```bash
# Install dependencies
npm install

# Start server (production)
npm start

# Start server with hot reloading (development)
npm run dev

# Open in browser
open http://localhost:3000
```

## Hot Reloading

The `npm run dev` command uses **nodemon** to automatically restart the server when files change:

- Watches: `server/`, `shared/`, `client/` directories
- Monitors: `.js`, `.json`, `.html`, `.css` files
- Delay: 500ms after last change before restart
- Auto-reconnect: Client will reconnect after server restarts

**Note:** Client-side changes (HTML, CSS, JS) require a browser refresh after server restart.

## Key Files

| File | Purpose |
|------|---------|
| `server/index.js` | Main server, WebSocket handling, game logic |
| `client/client.js` | Canvas rendering, game loop |
| `client/networking.js` | WebSocket client, message handling |
| `client/input.js` | Keyboard/mouse input, chat UI |
| `shared/constants.js` | Move validation rules, game constants |

## Magic Numbers

| Number | Purpose |
|--------|---------|
| 48027 | Leaderboard message |
| 47095 | Chat message |
| 64535 + 12345 | Neutralize team (player disconnected) |
| 247 + 183 (0xf7 + 0xb7) | Chat message prefix |

## Piece Types

| ID | Piece |
|----|-------|
| 0 | Empty |
| 1 | Pawn |
| 2 | Knight |
| 3 | Bishop |
| 4 | Rook |
| 5 | Queen |
| 6 | King |

## Network Message Sizes

| Bytes | Type | Direction |
|-------|------|-----------|
| 0 | Join request | C→S |
| 8 | Move | C→S |
| 4+ | Chat | C→S |
| 8 | Set square | S→C |
| 10 | Move confirmation | S→C |
| Variable | Board state | S→C |
| Variable | Leaderboard | S→C |

## Important Constants

```javascript
boardW = 64           // Board width
boardH = 64           // Board height
moveCooldown = 1500   // 1.5 seconds
respawnTime = 5000    // 5 seconds
squareSize = 150      // Pixels per square
```

## Common Tasks

### Add a piece type:
1. Edit `shared/constants.js` - add to `moveMap`
2. Edit `client/client.js` - add to `srcs` array
3. Add PNG to `client/assets/`

### Add a network message:
1. Pick unique magic number
2. Add handler in `server/index.js` `message` event
3. Add handler in `client/networking.js` `onmessage` event
4. Document in README.md

### Change board size:
1. Edit `shared/constants.js` - change `boardW` and `boardH`
2. Restart server

## Development Workflow

1. Run `npm run dev` to start server with hot reloading
2. Make changes to server files - server auto-restarts
3. Make changes to client files - refresh browser after restart
4. Use browser DevTools for client debugging

## Debugging

```javascript
// Server console
console.table(global.board)  // Print board state
console.log({teams})          // Print teams

// Client console
console.log(board)           // Print local board
console.log('Legal:', legalMoves)  // Print legal moves
console.log(spatialHash.getAllPieces())  // Print all pieces
console.log({camera, infiniteMode})  // Print camera state
```

## Testing Commands

Use in chat:
- `/clear` - Clear chat history
- `/announce <msg>` - Send server announcement

## Architecture Notes

- Single-threaded Node.js server
- Binary WebSocket protocol (Uint16Array)
- Canvas-based rendering with viewport culling
- Shared move validation (client + server)
- Server is authoritative
