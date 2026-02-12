# Restart Server - Quick Guide

## The Problem
You're seeing old errors because the server is still running the old code.

## Solution: Restart the Server

### Step 1: Stop the Current Server
In your terminal where the server is running, press:
```
Ctrl + C
```

Or if that doesn't work, kill the process:
```bash
lsof -ti:3000 | xargs kill -9
```

### Step 2: Start the Server Again
```bash
npm start
```

### Expected Output (New Code):
```
🔧 DEV MODE: CAPTCHA BYPASSED
[GAME] Mode: 64x64 BOARD
[AI] System disabled
[Startup] Loading world...
[Startup] Loaded 253 pieces
Server Listening to Port 3000
```

**NO ERRORS!** ✅

### Step 3: Refresh Browser
Hard refresh your browser:
- **Mac:** Cmd + Shift + R
- **Windows/Linux:** Ctrl + Shift + R

---

## What You Should See After Restart

### Server Console (Clean):
```
🔧 DEV MODE: CAPTCHA BYPASSED
[GAME] Mode: 64x64 BOARD
[AI] System disabled
[Startup] Loading world...
[Startup] Loaded 253 pieces
[Startup] Loaded 0 player records
Server Listening to Port 3000
```

### Browser Console (After spawn):
```
🔧 DEV MODE: Bypassing captcha, showing player setup
🎮 Initializing player setup modal
🎮 Found color swatches: 8
🚀 Start button clicked: { playerName: 'greg', ... }
📤 Sending player info
📤 Sent spawn trigger
🔄 Viewport sync: selfId=1, pieces=254, infiniteMode=false
👑 Found my king at 23,45
📍 Camera centered on king at 23,45
✅ UI shown
```

### Game View:
- ✅ King piece centered on screen (not corner!)
- ✅ Leaderboard visible with your name
- ✅ Stats panel shows your info
- ✅ Can move around with WASD

---

## Still Seeing Errors?

If you still see `fs.readFileSync is not a function`:

1. Check you actually stopped the old server (Ctrl+C)
2. Verify no process on port 3000: `lsof -i:3000`
3. Kill it if found: `lsof -ti:3000 | xargs kill -9`
4. Start fresh: `npm start`

---

## Summary

**Just do this:**
1. Press Ctrl+C in server terminal
2. Run `npm start`
3. Hard refresh browser (Cmd+Shift+R)
4. Enter name and play!

That's it! 🚀