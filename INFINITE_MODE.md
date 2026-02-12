# Infinite Mode Toggle

## Overview

The game now includes an **Infinite Mode** toggle that allows switching between an infinite chess board and a classic 64x64 board for debugging purposes.

## Usage

### Enabling/Disabling Infinite Mode

1. When you reach the deployment screen, you'll see a checkbox labeled:
   ```
   INFINITE_MODE (UNCHECK FOR 64X64 DEBUG)
   ```

2. **Checked (Default)**: Infinite board mode - pieces can be placed anywhere on an unlimited board
3. **Unchecked**: Classic 64x64 board with boundaries and visual indicators

### Features in 64x64 Debug Mode

When infinite mode is **disabled**, the following changes occur:

#### Visual Indicators
- **Red Border**: A red rectangular border surrounds the 64x64 play area
- **Label**: "64x64 DEBUG MODE" text appears above the board
- **Boundary Enforcement**: Camera movement is constrained to keep the board visible

#### Minimap Differences
- **Infinite Mode**: Shows nearby pieces relative to camera position (100-square radius)
- **64x64 Mode**: Shows the entire board with all pieces visible

#### Camera Controls

**Keyboard:**
- `W` / `↑` - Move camera up
- `S` / `↓` - Move camera down
- `A` / `←` - Move camera left
- `D` / `→` - Move camera right
- `Z` - Zoom out
- `X` - Zoom in

**Mouse:**
- Scroll wheel to zoom in/out

**Mobile:**
- Joystick (bottom right) - Pan camera
- `-` button (left) - Zoom out
- `+` button (middle) - Zoom in

#### Technical Details

**Camera Constraints in 64x64 Mode:**
- Camera position is clamped to ensure the board stays within view
- Boundaries calculated based on current zoom level
- Prevents camera from moving beyond the board edges

**Rendering Optimizations:**
- In 64x64 mode, rendering range is limited to coordinates 0-63
- Board pattern generation respects boundaries
- Piece queries are optimized for the fixed board size

## Implementation

The infinite mode setting is stored globally as:
```javascript
window.infiniteMode = true; // or false
```

This variable is checked throughout the codebase to:
1. Apply boundary constraints on camera movement
2. Render board borders and labels
3. Calculate minimap display regions
4. Limit piece queries to visible areas

## Use Cases

### Debugging
- Test piece placement in a confined space
- Verify game logic with traditional chess board dimensions
- Debug collision and movement systems with known boundaries

### Development
- Profile rendering performance on a fixed-size board
- Test UI scaling and camera controls
- Validate spatial hash queries with limited coordinates

## Notes

- The setting is chosen at deployment time and persists for the session
- Server-side logic is unaffected; this is a client-side rendering feature
- All game mechanics work identically in both modes
- The toggle only affects visual representation and camera constraints