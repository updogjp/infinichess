# File System Fix - fs vs fsSync

## Issue
After migrating to async file operations, some synchronous `fs` calls were not updated to use `fsSync`, causing runtime errors:

```
TypeError: fs.readFileSync is not a function
TypeError: fs.writeFileSync is not a function
```

## Root Cause
Changed imports from:
```javascript
import fs from "fs";
```

To:
```javascript
import fs from "fs/promises";  // Async-only API
import fsSync from "fs";        // Sync API
```

But some sync operations still referenced `fs` instead of `fsSync`.

## Fixed Locations

### 1. `savePlayerMetadata()` - Line 635
**Before:**
```javascript
fs.writeFileSync(PLAYER_SAVE_PATH, JSON.stringify(data));
```

**After:**
```javascript
await fs.writeFile(PLAYER_SAVE_PATH, JSON.stringify(data));
```

### 2. Index HTML serving - Line 1047
**Before:**
```javascript
res.end(fs.readFileSync("client/index.html"));
```

**After:**
```javascript
res.end(fsSync.readFileSync("client/index.html"));
```

### 3. Asset file serving - Line 1101
**Before:**
```javascript
if (fs.existsSync(path) && fs.statSync(path).isFile()) {
```

**After:**
```javascript
if (fsSync.existsSync(path) && fsSync.statSync(path).isFile()) {
```

### 4. Asset file reading - Line 1104
**Before:**
```javascript
res.end(fs.readFileSync(path));
```

**After:**
```javascript
res.end(fsSync.readFileSync(path));
```

## Import Structure (Final)

```javascript
import fs from "fs/promises";  // For async operations (await)
import fsSync from "fs";        // For sync operations (blocking)
```

### When to Use Each

**Use `fs` (promises):**
- File operations during startup (loadWorld, loadPlayerMetadata)
- File operations in shutdown handlers
- Auto-save operations (saveWorld, savePlayerMetadata)
- Any operation that can be async

**Use `fsSync`:**
- Static file serving (needs to be synchronous for response)
- File existence checks during request handling
- Any operation in hot request paths

## Verification

Run server and check for:
- ✅ No TypeError on startup
- ✅ No errors during auto-save (every 2 minutes)
- ✅ Static files serve correctly
- ✅ Assets (images, audio) load properly

## Status
✅ **FIXED** - All file operations now use correct import