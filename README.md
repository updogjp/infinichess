# Infinichess

![Infinichess Logo](client/assets/infinichess_512.png)

A massively multiplayer infinite chess game where players control their own king pieces on an endless, persistent chessboard.

## Overview

Infinichess is a unique take on chess that combines traditional chess mechanics with massively multiplayer gameplay on an infinite world. Each player controls a single king, chooses their name and color, and can capture neutral pieces to build their own army. The world persists between server restarts, and players can claim territory for strategic advantages.

## Key Features

- **Infinite World**: No boundaries - play on an endless chessboard
- **Persistent State**: World saves to disk and survives server restarts
- **Player Customization**: Choose your name and color
- **Real-time Chat**: Floating chat bubbles above player kings
- **Massively Multiplayer**: Support for 100+ concurrent players

## Project History

**Infinichess** is a fork of **[10kchess](https://github.com/pentaswan/10kchess)** by [@pentaswan](https://github.com/pentaswan).

### Differences from Original

| Feature           | Original (10kchess) | Infinichess                      |
| ----------------- | ------------------- | -------------------------------- |
| Board Size        | 64x64 fixed         | Infinite world                   |
| World Persistence | None                | Saves to disk                    |
| Player Names      | Auto-generated      | Player-chosen                    |
| Player Colors     | Auto-generated      | Player-selected                  |
| Chat Display      | Sidebar only        | Floating bubbles + sidebar       |
| Broadcasting      | All players         | Viewport-based                   |
| Coordinate System | Pixel-based         | Grid-based with Int32Array       |
| AI Opponents      | None                | Multiple AI teams with cooldowns |

### Why Fork?

The original 10kchess was an excellent proof-of-concept for massively multiplayer chess, but was limited by its fixed 64x64 board. Infinichess extends this concept to a truly infinite world with persistence, better player customization, and AI opponents.

## Running the Project

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
# Install dependencies
npm install

# Start server (production)
npm start

# Start with hot reloading (development)
npm run dev

# Open browser
open http://localhost:3000
```

### Hot Reloading (Development)

The project uses **nodemon** for automatic server restarts during development:

```bash
npm run dev
```

**Features:**

- 🔄 Auto-restarts server when files change
- 👀 Watches `server/`, `shared/`, `client/` directories
- 📝 Monitors `.js`, `.json`, `.html`, `.css` files
- ⚡ 500ms delay after changes before restart
- 🔌 WebSocket clients auto-reconnect after restart

**Workflow:**

1. Run `npm run dev` to start with hot reloading
2. Edit server/shared files → server auto-restarts
3. Edit client files → refresh browser after restart
4. See `DEVELOPMENT.md` for detailed guide

### Development Mode

The server auto-detects local development. To bypass captcha for testing:

1. Edit `server/index.js` line ~9: Set a test captcha key or
2. Set `ws.verified = true` temporarily in the connection handler

## Architecture

### Tech Stack

- **Frontend**: Vanilla JavaScript with HTML5 Canvas
- **Backend**: Node.js with uWebSockets.js
- **Protocol**: Binary WebSocket messages (Int32Array for coordinates, Uint16Array for other data)
- **Storage**: Binary files for world persistence

### Key Components

1. **Spatial Hash**: Efficient infinite world storage
2. **Viewport Broadcasting**: Only send updates to visible players
3. **Procedural Generation**: Deterministic neutral piece spawning
4. **Persistence**: Auto-save world state every 60 seconds

## Network Protocol

The game uses a binary WebSocket protocol with Int32Array for coordinate messages and Uint16Array for other data, supporting infinite coordinate ranges.

### Magic Numbers

| Code  | Purpose                             | Format      |
| ----- | ----------------------------------- | ----------- |
| 55551 | Player info (name + color)          | Uint8Array  |
| 55552 | Camera position update              | Int32Array  |
| 55553 | Viewport sync                       | Int32Array  |
| 55554 | Move piece                          | Int32Array  |
| 55555 | Set square                          | Int32Array  |
| 47095 | Chat message                        | Uint16Array |
| 48027 | Leaderboard                         | Uint16Array |
| 64535 | Neutralize team (player disconnect) | Uint16Array |

## File Structure

```
/
├── client/
│   ├── index.html          # Game page with captcha and setup modal
│   ├── client.js           # Core rendering and game loop
│   ├── input.js            # Input handling and chat UI
│   ├── networking.js       # WebSocket and message handling
│   ├── style.css           # UI styling
│   └── assets/             # Chess pieces and audio
├── server/
│   ├── index.js            # WebSocket server, game state, persistence
│   └── badwords.js         # Chat moderation
├── shared/
│   └── constants.js        # Game constants and spatial hash
├── package.json            # Node.js dependencies
├── README.md               # This file
├── ARCHITECTURE.md         # Technical architecture
├── AGENTS.md               # AI coding guidelines
└── IMPLEMENTATION.md       # Implementation details
```

## Game Mechanics

### Infinite World

- 64x64 chunks loaded on-demand
- Procedural neutral piece generation (0.2% chance per square)
- Players spawn randomly within 50,000 squares of origin
- Kings cannot spawn within 4 squares of other kings

### Persistence

- World saves every 60 seconds
- Saves on graceful shutdown (SIGINT/SIGTERM)
- Neutral pieces persist between restarts
- Player metadata (names, colors, kills) persisted
- Auto-loads on server startup

### Piece Types

| ID  | Piece  | Movement                       |
| --- | ------ | ------------------------------ |
| 0   | Empty  | -                              |
| 1   | Pawn   | Orthogonal 1, diagonal capture |
| 2   | Knight | L-shape                        |
| 3   | Bishop | Diagonal                       |
| 4   | Rook   | Orthogonal                     |
| 5   | Queen  | Any direction                  |
| 6   | King   | Any direction 1 square         |

### Combat

- Move cooldown: 1.5 seconds
- Capture enemy kings to eliminate players
- Capture neutral pieces to add to your army
- Respawn time: 5 seconds

## License

ISC

## Credits

- **Original Project**: [10kchess](https://github.com/pentaswan/10kchess) by [@pentaswan](https://github.com/pentaswan)
- **Chess Pieces**: Standard chess set sprites
- **Audio**: Move, capture, and game over sounds
- **Built with**: uWebSockets.js, vanilla JavaScript

## Contributing

This is a forked project. For the original, see [10kchess](https://github.com/pentaswan/10kchess).

To contribute to Infinichess:

1. Fork this repository
2. Create a feature branch
3. Submit a pull request

## Future Plans

- [ ] Better camera controls (drag to pan)
- [ ] Performance optimizations for 1000+ players
- [ ] Player statistics tracking
- [ ] Spectator mode
- [ ] Replay system

---

_Infinichess - Infinite chess, infinite possibilities._
