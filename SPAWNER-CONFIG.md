# Piece Spawner Configuration Guide

## What is the Piece Spawner?

The piece spawner automatically generates neutral chess pieces across the infinite board. These pieces:
- Are colored white (team = 0)
- Can be captured by any player
- Fill the world to make it feel populated
- Are saved to disk and persist between server restarts

## Why Was It Running When No One Was Playing?

**Before:** The spawner ran continuously, adding pieces every 100ms until reaching 5000 pieces.

**After:** The spawner only runs when players are connected (configurable).

## Configuration

Edit these values at the top of `server/index.js`:

```javascript
const SPAWNER_CONFIG = {
  enabled: true,                    // Master on/off switch
  targetPieces: 5000,               // Maximum neutral pieces in world
  spawnRate: 5,                     // Pieces spawned per interval
  spawnInterval: 100,               // Milliseconds between spawns
  onlyWhenPlayersOnline: true,      // Only spawn when players connected
};
```

### Settings Explained

#### `enabled` (boolean)
- **Default:** `true`
- **Purpose:** Master switch for the entire spawner system
- **When to disable:** 
  - Testing without pieces
  - Debugging spawn issues
  - Running a minimal server

```javascript
enabled: false  // Completely disable spawning
```

#### `targetPieces` (number)
- **Default:** `5000`
- **Purpose:** Maximum number of neutral pieces in the world
- **Behavior:** Once reached, spawner stops until count drops below this
- **Recommendations:**
  - Small world: `1000-2000`
  - Medium world: `3000-5000` (default)
  - Large world: `7000-10000`
  - Development: `100-500`

```javascript
targetPieces: 1000  // Smaller world, less memory
```

#### `spawnRate` (number)
- **Default:** `5`
- **Purpose:** How many pieces to attempt spawning per interval
- **Behavior:** Tries to place this many pieces each interval
- **Note:** Actual spawn rate may be lower due to:
  - Occupied locations
  - Procedural generation rules (0.2% chance per coordinate)

```javascript
spawnRate: 10  // Faster spawning
spawnRate: 1   // Slower, more gradual spawning
```

#### `spawnInterval` (milliseconds)
- **Default:** `100` (10 times per second)
- **Purpose:** How often the spawner runs
- **Performance:** Lower = faster spawning but more CPU
- **Recommendations:**
  - Fast: `50-100ms`
  - Normal: `100-200ms` (default)
  - Slow: `500-1000ms`

```javascript
spawnInterval: 500  // Run spawner every half second
```

#### `onlyWhenPlayersOnline` (boolean)
- **Default:** `true`
- **Purpose:** Only spawn pieces when players are connected
- **Why:** Prevents pieces accumulating when server is idle
- **When to disable:**
  - Pre-populating world before players join
  - Running background world generation

```javascript
onlyWhenPlayersOnline: false  // Always spawn, even when idle
```

## Common Configurations

### Development Mode (Fast, Small World)
```javascript
const SPAWNER_CONFIG = {
  enabled: true,
  targetPieces: 500,
  spawnRate: 10,
  spawnInterval: 100,
  onlyWhenPlayersOnline: true,
};
```

### Production Mode (Large, Populated World)
```javascript
const SPAWNER_CONFIG = {
  enabled: true,
  targetPieces: 8000,
  spawnRate: 5,
  spawnInterval: 150,
  onlyWhenPlayersOnline: true,
};
```

### Testing Mode (Minimal Pieces)
```javascript
const SPAWNER_CONFIG = {
  enabled: true,
  targetPieces: 100,
  spawnRate: 5,
  spawnInterval: 500,
  onlyWhenPlayersOnline: true,
};
```

### Offline World Generation
```javascript
const SPAWNER_CONFIG = {
  enabled: true,
  targetPieces: 5000,
  spawnRate: 20,
  spawnInterval: 50,
  onlyWhenPlayersOnline: false,  // Generate even when no players
};
```

### Disabled (No Auto-Spawning)
```javascript
const SPAWNER_CONFIG = {
  enabled: false,
  targetPieces: 0,
  spawnRate: 0,
  spawnInterval: 0,
  onlyWhenPlayersOnline: false,
};
```

## How It Works

1. **Timer runs** every `spawnInterval` milliseconds
2. **Check if enabled** - Exit if `enabled: false`
3. **Check for players** - Exit if no players and `onlyWhenPlayersOnline: true`
4. **Check piece count** - Exit if count >= `targetPieces`
5. **For each spawn attempt** (up to `spawnRate`):
   - Generate random position in world
   - Check procedural generation for piece type at that location
   - If valid piece and location empty, spawn it
6. **Broadcast** piece placement to nearby players

## Procedural Generation

Pieces aren't spawned randomly everywhere. The world uses procedural generation:

```javascript
// From shared/constants.js
getProceduralPiece(x, y) {
  const seed = x * 100000 + y;
  const noise = seededRandom(seed);
  
  // Only 0.2% chance of piece at any coordinate
  if (noise > 0.002) return EMPTY;
  
  // Piece type distribution:
  // 70% pawns
  // 15% knights
  // 10% bishops
  // 4% rooks
  // 1% queens
}
```

This means:
- Same coordinates always generate same piece type
- Most of the board is empty
- Pawns are most common, queens are rare
- World is deterministic and infinite

## Performance Impact

### CPU Usage

```
targetPieces: 1000,  spawnRate: 5,  interval: 100ms  → Low CPU
targetPieces: 5000,  spawnRate: 5,  interval: 100ms  → Medium CPU
targetPieces: 10000, spawnRate: 10, interval: 50ms   → High CPU
```

### Memory Usage

Each piece uses ~40 bytes in spatial hash:
- 1,000 pieces ≈ 40 KB
- 5,000 pieces ≈ 200 KB
- 10,000 pieces ≈ 400 KB

### Disk Usage

Save files scale with piece count:
- 5,000 pieces ≈ 60 KB saved
- Auto-saves every 60 seconds

## Monitoring

Check spawner status in server console:

```
[Spawner] Configured - Target: 5000 pieces, Only when players online: true
```

Watch piece count in auto-save logs:

```
[Persistence] Saved 189 neutral pieces
[Persistence] Saved 196 neutral pieces  ← Growing
[Persistence] Saved 199 neutral pieces
[Persistence] Saved 199 neutral pieces  ← Stable
```

When stable, spawner has reached target.

## Troubleshooting

### Pieces spawn too fast
```javascript
spawnRate: 1,          // Fewer per interval
spawnInterval: 500,    // Less frequent intervals
```

### Pieces spawn too slow
```javascript
spawnRate: 10,         // More per interval
spawnInterval: 50,     // More frequent intervals
```

### Server lag when spawning
```javascript
spawnInterval: 500,    // Reduce frequency
targetPieces: 2000,    // Lower total count
```

### Pieces spawn when no one playing
```javascript
onlyWhenPlayersOnline: true,  // Enable player check
```

### No pieces spawning
```javascript
enabled: true,                          // Enable spawner
targetPieces: 5000,                     // Ensure not 0
onlyWhenPlayersOnline: false,           // Disable player check for testing
```

Check console for spawner confirmation message.

## Advanced: Manual Spawning

Disable auto-spawner and spawn manually:

```javascript
// In server/index.js
const SPAWNER_CONFIG = {
  enabled: false,  // Disable auto-spawner
  ...
};

// Add manual spawn function
function spawnPiecesInArea(centerX, centerY, radius, count) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * radius;
    const x = Math.floor(centerX + Math.cos(angle) * dist);
    const y = Math.floor(centerY + Math.sin(angle) * dist);
    
    const pieceType = getProceduralPiece(x, y);
    if (pieceType !== 0 && !spatialHash.has(x, y)) {
      setSquare(x, y, pieceType, 0);
    }
  }
}

// Call when player spawns
spawnPiecesInArea(playerX, playerY, 30, 50);
```

## Best Practices

1. **Development:** Keep `targetPieces` low (500-1000) for faster testing
2. **Production:** Use reasonable target (3000-5000) for balance
3. **Always enable** `onlyWhenPlayersOnline: true` unless testing
4. **Monitor** piece count in console logs
5. **Adjust** based on server performance and player count

## Related Files

- `server/index.js` - Main spawner code and config
- `shared/constants.js` - Procedural generation logic
- `server/world.dat` - Saved pieces (binary)
- `ARCHITECTURE.md` - World generation details