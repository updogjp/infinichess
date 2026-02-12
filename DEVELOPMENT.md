# Development Guide

## Quick Start

```bash
# Install dependencies
npm install

# Start with hot reloading
npm run dev

# Production mode
npm start
```

## Hot Reloading Setup

This project uses **nodemon** for automatic server restarts during development.

### What Gets Watched

- `server/` - Server-side game logic and WebSocket handling
- `shared/` - Shared constants and move validation
- `client/` - Client-side HTML, CSS, and JavaScript

### File Types Monitored

- `.js` - JavaScript modules
- `.json` - Configuration files
- `.html` - Client HTML templates
- `.css` - Stylesheets

### Configuration

Hot reloading is configured in `nodemon.json`:

```json
{
  "watch": ["server", "shared", "client"],
  "ext": "js,json,html,css",
  "delay": 500,
  "verbose": true
}
```

### How It Works

1. **Save a file** in watched directories
2. **Nodemon detects** the change (500ms delay)
3. **Server restarts** automatically
4. **WebSocket reconnects** happen automatically
5. **Refresh browser** to see client-side changes

### Important Notes

- **Server changes**: Auto-restart, clients reconnect
- **Client changes**: Require manual browser refresh (F5)
- **Shared changes**: Affect both, server restarts
- **Node modules**: Not watched, requires manual restart

## Development Workflow

### Standard Flow

```bash
# Terminal 1: Start dev server
npm run dev

# Terminal 2: Watch for issues
tail -f server.log  # if logging is set up

# Browser: Open dev tools
# - Console for debugging
# - Network tab for WebSocket messages
# - Application tab for storage
```

### Making Changes

#### Server-Side Changes

1. Edit files in `server/` or `shared/`
2. Save file
3. Watch terminal - server auto-restarts
4. Client reconnects automatically
5. Continue testing

#### Client-Side Changes

1. Edit files in `client/`
2. Save file
3. Server restarts
4. **Refresh browser** (F5)
5. Test changes

### Debugging Tips

#### Server Console

```javascript
// Print spatial hash contents
console.log('Pieces:', spatialHash.getAllPieces());

// Print player metadata
console.log('Players:', Array.from(playerMetadata.entries()));

// Print leaderboard
console.log('Leaderboard:', Array.from(leaderboard.entries()));
```

#### Client Console

```javascript
// Print game state
console.log({
  selfId,
  playerName,
  playerColor,
  infiniteMode,
  camera
});

// Print pieces
console.log(spatialHash.getAllPieces());

// Print legal moves
console.log('Legal moves:', legalMoves);

// Force render
changed = true;
```

### Browser DevTools

**Console Tab:**
- Check for JavaScript errors
- Run debug commands
- Inspect game state variables

**Network Tab:**
- Monitor WebSocket connection
- View binary message traffic
- Check connection status

**Application Tab:**
- View localStorage/sessionStorage
- Monitor cookies
- Check cache

## Project Structure

```
10kchess-main/
├── server/
│   ├── index.js          # Main server, WebSocket, game logic
│   ├── badwords.js       # Chat filter
│   └── *.dat             # Persistence files (git ignored)
├── shared/
│   └── constants.js      # Move validation, game rules
├── client/
│   ├── index.html        # Main HTML template
│   ├── style.css         # Styles and UI
│   ├── client.js         # Canvas rendering, game loop
│   ├── networking.js     # WebSocket client, messages
│   ├── input.js          # Keyboard/mouse/chat input
│   └── assets/           # Images and sounds
├── package.json          # Dependencies and scripts
├── nodemon.json          # Hot reload configuration
└── README.md             # Project documentation
```

## Common Development Tasks

### Adding a New Piece Type

1. **Add to constants** (`shared/constants.js`):
   ```javascript
   // Add move pattern to moveMap
   moveMap[7] = [[...patterns]];
   ```

2. **Add image** (`client/assets/`):
   - Create `w<piece>.png` (white piece sprite)
   - 150x150px recommended

3. **Update client** (`client/client.js`):
   ```javascript
   const srcs = ['wp', 'wn', 'wb', 'wr', 'wq', 'wk', 'wnewpiece'];
   ```

### Adding a Network Message

1. **Choose magic number**:
   - Pick unique 16-bit number (0-65535)
   - Document in QUICKSTART.md

2. **Server handler** (`server/index.js`):
   ```javascript
   if (msg[0] === 12345) {
     // Handle message
   }
   ```

3. **Client handler** (`client/networking.js`):
   ```javascript
   if (msg[0] === 12345) {
     // Handle message
   }
   ```

### Modifying UI

1. **HTML** (`client/index.html`):
   - Modify structure
   - Save file

2. **CSS** (`client/style.css`):
   - Update styles
   - Use CSS variables for consistency

3. **Refresh browser** to see changes

### Testing Infinite Mode Toggle

1. Start dev server: `npm run dev`
2. Open browser to `http://localhost:3000`
3. Complete captcha
4. **Uncheck** "INFINITE_MODE" checkbox
5. Click "INITIATE_DEPLOYMENT"
6. Test 64x64 boundaries:
   - Red border visible
   - Camera constrained
   - Minimap shows full board

## Performance Optimization

### Profiling

**Server Side:**
```javascript
console.time('operation');
// ... code ...
console.timeEnd('operation');
```

**Client Side:**
```javascript
// Use browser Performance tab
// Record timeline while playing
// Look for:
// - Long render frames
// - Memory leaks
// - Excessive redraws
```

### Common Bottlenecks

1. **Spatial hash queries** - Keep query regions small
2. **Canvas redraws** - Use `changed` flag efficiently
3. **Tinted image cache** - Monitor MAX_TINTED_CACHE size
4. **WebSocket messages** - Batch updates when possible

## Testing

### Manual Testing Checklist

- [ ] Deploy with different colors
- [ ] Move pieces (all types)
- [ ] Test legal move validation
- [ ] Chat messages send/receive
- [ ] King capture and respawn
- [ ] Leaderboard updates
- [ ] Infinite mode ON/OFF
- [ ] Camera controls (keyboard/mouse/mobile)
- [ ] Zoom in/out
- [ ] Mobile touch controls

### Multi-Client Testing

```bash
# Terminal 1
npm run dev

# Browser 1
open http://localhost:3000

# Browser 2 (incognito)
open http://localhost:3000

# Test interaction between clients
```

## Troubleshooting

### Server Won't Start

```bash
# Check if port 3000 is in use
lsof -i :3000

# Kill process if needed
kill -9 <PID>

# Restart
npm run dev
```

### Hot Reload Not Working

1. Check `nodemon.json` exists
2. Verify file extensions match
3. Try manual restart: `rs` in terminal
4. Check file is in watched directory

### WebSocket Disconnects

1. Check server console for errors
2. Monitor Network tab in DevTools
3. Verify binary message format
4. Check for exceptions in handlers

### Client Not Updating

1. Hard refresh: `Cmd+Shift+R` (Mac) / `Ctrl+Shift+R` (Windows)
2. Clear cache
3. Check console for JS errors
4. Verify server restarted successfully

### Infinite Mode Issues

```javascript
// Check mode state
console.log('Infinite mode:', window.infiniteMode);

// Verify camera constraints
console.log('Camera:', camera);

// Check boundaries
console.log('Board bounds:', {
  minX: 0,
  maxX: window.infiniteMode ? Infinity : 63,
  minY: 0,
  maxY: window.infiniteMode ? Infinity : 63
});
```

## Best Practices

### Code Style

- Use modern ES6+ syntax
- Prefer `const` over `let`
- Use template literals for strings
- Add comments for complex logic

### Performance

- Minimize canvas redraws (use `changed` flag)
- Cache frequently used calculations
- Limit spatial hash query regions
- Batch network updates

### Debugging

- Use descriptive console.log messages
- Add error boundaries for critical sections
- Validate input data
- Check message formats

### Version Control

```bash
# Before making changes
git checkout -b feature/my-feature

# Make changes, test thoroughly
npm run dev

# Commit with clear messages
git add .
git commit -m "feat: add new feature"

# Push to remote
git push origin feature/my-feature
```

## Resources

- [uWebSockets.js Documentation](https://github.com/uNetworking/uWebSockets.js)
- [Canvas API Reference](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
- [WebSocket Protocol](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [Nodemon Documentation](https://nodemon.io/)

## Getting Help

1. Check console for error messages
2. Review QUICKSTART.md for reference
3. Check ARCHITECTURE.md for system design
4. Read inline code comments
5. Test with minimal reproduction

## Contributing

See project README.md for contribution guidelines.