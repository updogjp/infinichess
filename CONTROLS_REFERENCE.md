# Infinichess Controls Quick Reference

## 📱 MOBILE CONTROLS

### Touch Gestures
| Gesture | Action |
|---------|--------|
| **Single Tap** | Select piece / Move to square |
| **Tap & Drag** | Select and move piece |
| **Two-Finger Pinch** | Zoom in/out (0.27x - 6x) |
| **Two-Finger Drag** | Pan camera (no piece selection) |

### On-Screen Controls
```
Left Side:              Right Side:
  [+]                      ⊕
  Zoom In                 ◯│  Joystick
                          ╱│  (Camera Movement)
  [-]                    ◯ │
  Zoom Out
```

| Control | Location | Function |
|---------|----------|----------|
| **[+] Button** | Left bottom | Zoom in |
| **[-] Button** | Left middle | Zoom out |
| **Joystick** | Right side | Analog camera movement |

### Tips
- 🎯 Use **two fingers** to explore without selecting pieces
- 📍 **Pinch** for precise zoom before making moves
- 🕹️ **Joystick** for smooth camera navigation
- 👆 **Single tap** for all piece interactions

---

## 🖥️ DESKTOP CONTROLS

### Mouse
| Action | Control |
|--------|---------|
| **Select / Move Piece** | Left Click |
| **Pan Camera** | Right Click + Drag |
| **Pan Camera (Alt)** | Middle Click + Drag |
| **Zoom** | Scroll Wheel |

### Keyboard
| Key | Action |
|-----|--------|
| **W** or **↑** | Move camera up |
| **S** or **↓** | Move camera down |
| **A** or **←** | Move camera left |
| **D** or **→** | Move camera right |
| **Z** | Zoom out |
| **X** | Zoom in |
| **H** | Toggle UI visibility |
| **Enter** | Open chat |

### Tips
- 🖱️ **Right-click drag** for quick repositioning
- ⌨️ **WASD** for continuous camera movement
- 🔍 **Scroll wheel** for precise zoom
- 👁️ **Press H** to hide UI for screenshots

---

## 🎮 GAMEPLAY BASICS

### Making a Move
1. **Click/Tap** your piece
2. Legal moves highlight
3. **Click/Tap** destination square
4. Piece moves automatically

### Camera Control
- **Zoom Range:** 0.27x (far) to 6x (close)
- **Movement Speed:** Scales with zoom level
- **Infinite Mode:** No boundaries, explore forever!

### UI Elements
```
┌─────────────────────────────────┐
│ [Stats]        [🟢 12 ONLINE]   │
│ Player: YOU    [Leaderboard]    │
│ Zoom: 1.5x     🟦 Player1 [10]  │
│                🟥 Player2 [7]   │
│                                 │
│     [Game Board]                │
│                                 │
│ [Chat Messages]                 │
└─────────────────────────────────┘
```

---

## 💬 CHAT COMMANDS

| Command | Effect |
|---------|--------|
| **/clear** | Clear chat history |
| **Enter** | Open chat input |
| **Type + Enter** | Send message |

---

## 🎯 PRO TIPS

### Mobile
✅ Use pinch zoom before moving for accuracy
✅ Two-finger pan to scout without selecting
✅ Joystick is analog - distance = speed
✅ Tap zoom buttons for quick adjustments

### Desktop
✅ Combine WASD + mouse for best control
✅ Right-drag for quick camera jumps
✅ Scroll zoom while moving for flow
✅ Press H to hide UI when needed

---

## 🐛 TROUBLESHOOTING

### "Can't zoom on mobile"
→ Try pinch gesture or [+]/[-] buttons

### "Right-click shows menu"
→ Game blocks this automatically. Try middle button.

### "Joystick not visible"
→ Only appears on mobile devices

### "Online count shows 0"
→ Wait a few seconds for server sync

---

## 📊 LEADERBOARD

```
🟢 15 ONLINE     ← Live player count
─────────────
LEADERBOARD
🟦 Player1 [10]  ← Color + Name + Kills
🟥 Player2 [7]
🟩 Player3 [5]
```

**Legend:**
- 🟢 = Server online (pulsing)
- 🟦🟥🟩 = Player color indicator
- **White text** = Always readable!
- **[Number]** = Kill count

---

## ⚙️ STATS PANEL

```
STATS
PLAYER:    YOUR_NAME
COLOR:     #FFB3BA
MODE:      INFINITE
POSITION:  50,23
ZOOM:      1.50x
PIECES:    16
```

---

## 🌐 PLATFORM SUPPORT

✅ iOS Safari (iPhone/iPad)
✅ Chrome Mobile (Android)
✅ Firefox Mobile
✅ Desktop Chrome/Firefox/Safari/Edge

---

**Need more help?** See `UI_IMPROVEMENTS_GUIDE.md` for detailed visual guide.

**For developers:** See `MOBILE_DESKTOP_UPDATES.md` for implementation details.