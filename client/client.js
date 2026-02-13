// Determine WebSocket URL based on environment
window.isDev = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const HOST = window.isDev 
  ? location.origin.replace(/^http/, "ws")
  : "wss://api.infinichess.io";

// Splash screen → player setup transition after 3 seconds
let renderLoopStarted = false;
window.startRenderLoop = () => {
  if (renderLoopStarted) return;
  if (!imgsLoaded) {
    // Images not ready yet, queue it
    onImagesLoaded = () => {
      if (renderLoopStarted) return;
      renderLoopStarted = true;
      console.log("🎮 Starting render loop (deferred until images loaded)");
      requestAnimationFrame(render);
    };
    return;
  }
  renderLoopStarted = true;
  console.log("🎮 Starting render loop");
  requestAnimationFrame(render);
};

setTimeout(() => {
  const splash = document.getElementById("splashScreen");
  const playerSetup = document.getElementById("playerSetupDiv");
  if (splash) {
    splash.classList.add("splash-fade-out");
    setTimeout(() => {
      splash.style.display = "none";
      // Show deploy screen first, then start render loop
      if (playerSetup) playerSetup.classList.remove("hidden");
      try { window.startRenderLoop(); } catch (e) { console.error("startRenderLoop error:", e); }
      try { if (typeof initPlayerSetup === "function") initPlayerSetup(); } catch (e) { console.error("initPlayerSetup error:", e); }
    }, 600);
  }
}, 3000);

const canvas = document.getElementById("canvas");
let ctx = null;

function initializeCanvas() {
  if (!ctx) {
    ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: false });
    if (!ctx) {
      console.error("❌ Failed to get 2D canvas context");
      window.showToast("Canvas initialization failed", "error", 5000);
      return false;
    }
    console.log("✅ Canvas context initialized");
  }
  return true;
}

// Initialize canvas on first use
if (!initializeCanvas()) {
  throw new Error("Cannot initialize canvas context");
}

// Spatial hash is now defined in networking.js
// window.spatialHash is available

let mouse;
let selectedSquareX, selectedSquareY;
let legalMoves = undefined,
  draggingSelected = false,
  moveWasDrag = false;
let cooldownEndTime = 0;
let invalidClickEffect = null; // { x, y, time } for brief red flash on invalid clicks

// Debug threat visualization
let debugShowThreats = false;
window.toggleDebugThreats = () => {
  debugShowThreats = !debugShowThreats;
  console.log(`🎯 Debug threats: ${debugShowThreats ? 'ON' : 'OFF'}`);
  changed = true;
};

// Toast notification system
const toastContainer = document.getElementById("toastContainer");
window.showToast = (message, type = "info", duration = 4000) => {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("toast-out");
    setTimeout(() => toast.remove(), 300);
  }, duration);
};

// Suppress default browser error UI, use toasts instead
window.onerror = (msg, src, line) => {
  if (msg === "ResizeObserver loop completed with undelivered notifications.") return true;
  const short = String(msg).slice(0, 80);
  window.showToast(`${short}`, "error", 5000);
  return true;
};
window.onunhandledrejection = (e) => {
  e.preventDefault();
  const msg = e.reason ? String(e.reason.message || e.reason).slice(0, 80) : "Promise rejected";
  window.showToast(msg, "error", 5000);
};

// Kill feed notification system
const killFeedContainer = document.getElementById("killFeed");
window.showKillFeed = (attacker, victim, pieceName, isSelf) => {
  if (!killFeedContainer) return;
  const entry = document.createElement("div");
  entry.className = `kill-entry${isSelf ? " kill-self" : ""}`;
  entry.innerHTML = `<span class="kill-attacker">${attacker}</span> ⚔ <span class="kill-victim">${victim}</span>'s <span class="kill-piece">${pieceName}</span>`;
  killFeedContainer.appendChild(entry);

  // Keep max 5 entries
  while (killFeedContainer.children.length > 5) {
    killFeedContainer.firstChild.remove();
  }

  setTimeout(() => {
    entry.classList.add("kill-fade");
    setTimeout(() => entry.remove(), 400);
  }, 4000);
};

// Camera panning state
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let cameraStartX = 0;
let cameraStartY = 0;

window.onmousemove = (e) => {
  // Handle camera panning
  if (isPanning) {
    const dx = e.clientX - panStartX;
    const dy = e.clientY - panStartY;
    camera.x = cameraStartX + dx / camera.scale;
    camera.y = cameraStartY + dy / camera.scale;
    changed = true;
    return;
  }

  mouse = e;
  if (selectedSquareX !== undefined) {
    changed = true;
  }
  // Update tooltip on mouse move (DOM only, no canvas redraw needed)
  if (typeof updatePieceTooltip === "function") updatePieceTooltip();
};

window.oncontextmenu = (e) => {
  e.preventDefault();
  return false;
};

window.onmousedown = (e) => {
  // Middle mouse (button 1) or Right mouse (button 2) for panning
  if (e.button === 1 || e.button === 2) {
    isPanning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    cameraStartX = camera.x;
    cameraStartY = camera.y;
    canvas.style.cursor = "grabbing";
    document.body.style.cursor = "grabbing";
    e.preventDefault();
    return;
  }

  // Left click (button 0) - piece selection/movement
  if (e.button !== 0) return;

  mousePos = canvasPos({ x: e.x, y: e.y });

  const squareX = Math.floor(mousePos.x / squareSize);
  const squareY = Math.floor(mousePos.y / squareSize);

  if (legalMoves !== undefined && selectedSquareX !== undefined) {
    for (let i = 0; i < legalMoves.length; i++) {
      if (
        legalMoves[i][0] === squareX &&
        legalMoves[i][1] === squareY &&
        performance.now() >= cooldownEndTime
      ) {
        const buf = new Int32Array(5);
        buf[0] = 55550; // Magic number for move
        buf[1] = selectedSquareX;
        buf[2] = selectedSquareY;
        buf[3] = squareX;
        buf[4] = squareY;
        send(buf);

        legalMoves = [];

        selectedSquareX = squareX;
        selectedSquareY = squareY;

        unconfirmedSX = selectedSquareX;
        unconfirmedSY = selectedSquareY;

        moveWasDrag = false;
        cooldownEndTime = performance.now() + (window.moveCooldown || 1500);
        return;
      }
    }
  }
  selectedSquareX = selectedSquareY = undefined;
  legalMoves = undefined;

  // Check if clicking on own piece
  if (window.spatialHash) {
    const piece = window.spatialHash.get(squareX, squareY);

    if (piece.type !== 0 && piece.team === selfId) {
      selectedSquareX = squareX;
      selectedSquareY = squareY;

      const myKills = (window.playerNamesMap && window.playerNamesMap[selfId])
        ? window.playerNamesMap[selfId].kills : 0;
      legalMoves = generateLegalMoves(
        selectedSquareX,
        selectedSquareY,
        window.spatialHash,
        selfId,
        myKills,
      );

      draggingSelected = true;
      changed = true;
    } else if (piece.type !== 0 && piece.team !== 0 && piece.team !== selfId && selfId !== -1) {
      // Clicked on enemy piece without a selection — brief red flash
      invalidClickEffect = { x: squareX, y: squareY, time: performance.now() };
      changed = true;
    }
  }
};

let unconfirmedSX, unconfirmedSY;
window.onmouseup = (e) => {
  // End camera panning
  if (isPanning) {
    isPanning = false;
    canvas.style.cursor = "default";
    document.body.style.cursor = "default";
    return;
  }

  if (selectedSquareX !== undefined) {
    const newX = Math.floor(mousePos.x / squareSize);
    const newY = Math.floor(mousePos.y / squareSize);

    let legal = false;
    for (let i = 0; i < legalMoves.length; i++) {
      if (legalMoves[i][0] === newX && legalMoves[i][1] === newY) {
        legal = true;
        break;
      }
    }

    if (legal === true && performance.now() >= cooldownEndTime) {
      const buf = new Int32Array(5);
      buf[0] = 55550; // Magic number for move
      buf[1] = selectedSquareX;
      buf[2] = selectedSquareY;
      buf[3] = newX;
      buf[4] = newY;
      send(buf);

      legalMoves = [];
      unconfirmedSX = selectedSquareX;
      unconfirmedSY = selectedSquareY;

      moveWasDrag = true;
      cooldownEndTime = performance.now() + (window.moveCooldown || 1500);
      return;
    }
  }
  draggingSelected = false;
};

const colors = ["#4F4096", "#3A2E6F"]; // Purple theme
const squareSize = 150;

// Camera starts at origin — mobile gets a wider default view
const defaultScale = (window.innerWidth < 768) ? 0.55 : 1;
let camera = { x: 0, y: 0, scale: defaultScale };
window.camera = camera; // Export for networking.js to modify

// 0 - empty
// 1 - pawn
// 2 - knight
// 3 - bishop
// 4 - rook
// 5 - queen
// 6 - king
const srcs = ["wp", "wn", "wb", "wr", "wq", "wk"];

const imgs = [undefined];
let imgsToLoad = 0,
  imgsLoaded = false;
let onImagesLoaded = null;

for (let i = 0; i < srcs.length; i++) {
  imgsToLoad++;
  const img = new Image();
  img.src = `/client/assets/${srcs[i]}.png`;
  img.onload = () => {
    imgsToLoad--;
    console.log(`🖼️ Loaded image: ${srcs[i]}.png (${6 - imgsToLoad}/6)`);
    if (imgsToLoad === 0) {
      imgsLoaded = true;
      console.log("✅ All images loaded, ready to render");
      window.imgs = imgs;
      if (onImagesLoaded) onImagesLoaded();
    }
  };
  img.onerror = () => {
    console.error(`❌ Failed to load image: ${srcs[i]}.png`);
  };
  imgs.push(img);
}

const audioSrcs = ["move1", "move2", "capture1", "capture2", "gameover"];
let audios = [];
let audiosToLoad = 0,
  audioLoaded = false;
for (let i = 0; i < audioSrcs.length; i++) {
  audiosToLoad++;
  const a = new Audio();
  a.src = `client/assets/${audioSrcs[i]}.mp3`;
  a.oncanplay = () => {
    audiosToLoad--;
    audios[i] = a;
    console.log(`🔊 Loaded audio: ${audioSrcs[i]}.mp3 (${5 - audiosToLoad}/5)`);
    if (audiosToLoad === 0) {
      audioLoaded = true;
      console.log("✅ All audio loaded");
      audios = {
        move: [audios[0], audios[1]],
        capture: [audios[2], audios[3]],
        gameover: [audios[4]],
      };
    }
  };
}

const tintedImgs = new Map(); // Use Map for better memory management with LRU
const MAX_TINTED_CACHE = 100;

let time = performance.now();
let lastTime = time;
let dt = 0;
let mousePos;
let gameOver = false,
  interpSquare = undefined,
  gameOverAlpha = 0,
  gameOverTime;

// Capture visual effects
const captureEffects = new Map(); // "x,y" -> { startTime, color, pieceType }
const CAPTURE_EFFECT_DURATION = 600; // ms

// Last move highlight
let lastMoveFrom = null; // { x, y }
let lastMoveTo = null; // { x, y }

window.setLastMove = (fromX, fromY, toX, toY) => {
  lastMoveFrom = { x: fromX, y: fromY };
  lastMoveTo = { x: toX, y: toY };
  changed = true;
};

// Screen shake state
let shakeIntensity = 0;
let shakeDecay = 0;
let shakeOffsetX = 0;
let shakeOffsetY = 0;

window.triggerCaptureEffect = (x, y, color, pieceType) => {
  captureEffects.set(`${x},${y}`, {
    startTime: performance.now(),
    color: color,
    pieceType: pieceType,
  });
  changed = true;
};

window.triggerScreenShake = (intensity) => {
  shakeIntensity = intensity;
  shakeDecay = intensity;
  changed = true;
};


// Track first render for initial camera setup
let firstRenderDone = false;

function render() {
  if (!ctx) {
    if (!initializeCanvas()) {
      requestAnimationFrame(render);
      return;
    }
  }

  canvas.w = canvas.width;
  canvas.h = canvas.height;
  
  if (canvas.w <= 0 || canvas.h <= 0) {
    requestAnimationFrame(render);
    return;
  }

  ctx.imageSmoothingEnabled = camera.scale < 2;

  requestAnimationFrame(render);

  time = performance.now();
  dt = time - lastTime;
  if (cooldownEndTime > time) changed = true;
  lastTime = time;

  // Force rendering for first few seconds after spawn
  if (!firstRenderDone && selfId !== -1) {
    changed = true;
    firstRenderDone = true;
  }

  // Handle camera movement
  const moveSpeed = (300 / camera.scale) * (dt / 16.66);
  let moved = false;

  if (window.input) {
    if (window.input.up) {
      camera.y += moveSpeed;
      moved = true;
    }
    if (window.input.down) {
      camera.y -= moveSpeed;
      moved = true;
    }
    if (window.input.left) {
      camera.x += moveSpeed;
      moved = true;
    }
    if (window.input.right) {
      camera.x -= moveSpeed;
      moved = true;
    }
    if (window.input.zoomIn) {
      const oldScale = camera.scale;
      camera.scale *= 1.02;
      if (camera.scale > 6) camera.scale = 6;
      // Keep screen center fixed: camera = camera * oldScale / newScale
      camera.x = camera.x * oldScale / camera.scale;
      camera.y = camera.y * oldScale / camera.scale;
      moved = true;
    }
    if (window.input.zoomOut) {
      const oldScale = camera.scale;
      camera.scale *= 0.98;
      if (camera.scale < 0.27) camera.scale = 0.27;
      camera.x = camera.x * oldScale / camera.scale;
      camera.y = camera.y * oldScale / camera.scale;
      moved = true;
    }
  }

  // Camera follow mode: smoothly track player's piece using cached position
  if (window.followCamera && selfId !== -1 && window.myKingX !== undefined) {
    const targetX = -(window.myKingX * squareSize + squareSize / 2);
    const targetY = -(window.myKingY * squareSize + squareSize / 2);
    const followLerp = 1 - Math.pow(0.01, dt / 1000);
    camera.x = interpolate(camera.x, targetX, followLerp);
    camera.y = interpolate(camera.y, targetY, followLerp);
    changed = true;
  }

  // Apply 64x64 boundary constraints if not in infinite mode
  if (!window.infiniteMode) {
    const viewWidth = canvas.w / camera.scale;
    const viewHeight = canvas.h / camera.scale;
    const boardPixels = 64 * squareSize;

    // Camera is negated world position, so board spans camera values [0, -boardPixels]
    // Allow some margin so you can see the edges
    const margin = viewWidth * 0.1;
    const maxX = margin;
    const minX = -boardPixels - margin + viewWidth;
    const maxY = margin;
    const minY = -boardPixels - margin + viewHeight;

    if (minX < maxX) {
      camera.x = Math.max(minX, Math.min(maxX, camera.x));
    }
    if (minY < maxY) {
      camera.y = Math.max(minY, Math.min(maxY, camera.y));
    }
  }

  if (moved) changed = true;

  // Keep rendering during active interpolations or fades
  if (interpolatingPieces && Object.keys(interpolatingPieces).length > 0) changed = true;
  if (window.aiCooldowns && window.aiCooldowns.size > 0) changed = true;
  if (captureEffects.size > 0) changed = true;
  if (shakeIntensity > 0.1) changed = true;

  if (!changed && !interpSquare) return;
  changed = false;

  // Process screen shake
  if (shakeIntensity > 0.1) {
    shakeIntensity *= Math.pow(0.001, dt / 1000); // Exponential decay
    shakeOffsetX = (Math.random() - 0.5) * shakeIntensity * 2;
    shakeOffsetY = (Math.random() - 0.5) * shakeIntensity * 2;
  } else {
    shakeIntensity = 0;
    shakeOffsetX = 0;
    shakeOffsetY = 0;
  }

  try {
    // Clear background
    ctx.fillStyle = "#121212";
    ctx.fillRect(0, 0, canvas.w, canvas.h);

    ctx.save();
    ctx.translate(canvas.w / 2 + shakeOffsetX, canvas.h / 2 + shakeOffsetY);
    ctx.scale(camera.scale, camera.scale);
    ctx.translate(camera.x, camera.y);
  } catch (e) {
    console.error("Canvas rendering error:", e);
    ctx.restore();
    return;
  }

  // Calculate visible range
  let topLeft = canvasPos({ x: 0, y: 0 });
  let bottomRight = canvasPos({ x: innerWidth, y: innerHeight });

  // Convert to grid coordinates
  let startX = Math.floor(topLeft.x / squareSize) - 1;
  let endX = Math.ceil(bottomRight.x / squareSize) + 1;
  let startY = Math.floor(topLeft.y / squareSize) - 1;
  let endY = Math.ceil(bottomRight.y / squareSize) + 1;

  // Apply 64x64 boundaries if not in infinite mode
  if (!window.infiniteMode) {
    startX = Math.max(startX, 0);
    endX = Math.min(endX, 63);
    startY = Math.max(startY, 0);
    endY = Math.min(endY, 63);
  }

  // Render infinite chess board pattern
  ctx.fillStyle = colors[0];
  ctx.fillRect(
    startX * squareSize,
    startY * squareSize,
    (endX - startX + 2) * squareSize,
    (endY - startY + 2) * squareSize,
  );

  ctx.fillStyle = colors[1];
  for (let i = startX; i <= endX; i++) {
    for (let j = startY; j <= endY; j++) {
      if ((i + j) % 2 === 0) {
        ctx.fillRect(i * squareSize, j * squareSize, squareSize, squareSize);
      }
    }
  }

  // Draw board border in 64x64 mode
  if (!window.infiniteMode) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 2 / camera.scale;
    ctx.strokeRect(0, 0, 64 * squareSize, 64 * squareSize);
  }

  // Render last move highlight
  if (lastMoveFrom && lastMoveTo) {
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = "#ffcc44";
    ctx.fillRect(lastMoveFrom.x * squareSize, lastMoveFrom.y * squareSize, squareSize, squareSize);
    ctx.fillRect(lastMoveTo.x * squareSize, lastMoveTo.y * squareSize, squareSize, squareSize);
    ctx.globalAlpha = 1;
  }

  // Render legal moves with capture indicators
  if (legalMoves) {
    for (let i = 0; i < legalMoves.length; i++) {
      const [mx, my] = legalMoves[i];
      if (mx < startX || mx > endX || my < startY || my > endY) continue;

      const x = mx * squareSize + squareSize / 2;
      const y = my * squareSize + squareSize / 2;

      // Check if this move is a capture
      const targetPiece = window.spatialHash ? window.spatialHash.get(mx, my) : { type: 0 };
      if (targetPiece.type !== 0) {
        // Capture indicator: hollow ring around the square
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = "#ff4444";
        ctx.lineWidth = squareSize * 0.08;
        ctx.beginPath();
        ctx.arc(x, y, squareSize * 0.42, 0, Math.PI * 2);
        ctx.stroke();
        ctx.closePath();
      } else {
        // Empty move: small dot
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = "black";
        ctx.beginPath();
        ctx.arc(x, y, squareSize / 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.closePath();
      }
    }
    ctx.globalAlpha = 1;
  }

  // Debug: Render AI threat squares
  if (debugShowThreats && window.spatialHash) {
    const threatSquares = new Set();
    const visiblePieces = window.spatialHash.queryRect(startX, startY, endX, endY);
    
    for (const piece of visiblePieces) {
      // Only check AI pieces (team >= 10000)
      if (piece.team < 10000 || piece.type === 0) continue;
      
      // Generate legal moves for this AI piece (assume 5 kills for range)
      const moves = generateLegalMoves(piece.x, piece.y, window.spatialHash, piece.team, 5);
      for (const [mx, my] of moves) {
        threatSquares.add(`${mx},${my}`);
      }
    }
    
    // Draw threat squares
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = "#ff4444";
    for (const key of threatSquares) {
      const [x, y] = key.split(',').map(Number);
      if (x >= startX && x <= endX && y >= startY && y <= endY) {
        ctx.fillRect(x * squareSize, y * squareSize, squareSize, squareSize);
      }
    }
    ctx.globalAlpha = 1;
  }

  // Render pieces from spatial hash
  let visiblePieces = [];
  if (window.spatialHash) {
    visiblePieces = window.spatialHash.queryRect(
      startX,
      startY,
      endX,
      endY,
    );

    for (const piece of visiblePieces) {
      if (piece.type === 0) continue;

      try {
        if (piece.team === 0) {
          // Neutral piece - draw white sprite with fade-in
          const fadeAlpha = window.getPieceFadeAlpha
            ? window.getPieceFadeAlpha(piece.x, piece.y)
            : 1.0;
          const fadeScale = window.getPieceFadeScale
            ? window.getPieceFadeScale(piece.x, piece.y)
            : 1.0;

          ctx.save();
          ctx.globalAlpha = fadeAlpha;

          if (fadeScale !== 1.0) {
            // Apply scale transform for pop-in effect
            const centerX = piece.x * squareSize + squareSize / 2;
            const centerY = piece.y * squareSize + squareSize / 2;
            ctx.translate(centerX, centerY);
            ctx.scale(fadeScale, fadeScale);
            ctx.translate(-centerX, -centerY);
          }

          if (imgs && imgs[piece.type]) {
            ctx.drawImage(
              imgs[piece.type],
              piece.x * squareSize,
              piece.y * squareSize,
            );
          }
          ctx.restore();
        } else {
          // Player piece - draw tinted sprite
          if (piece.team === selfId) {
            // Highlight own pieces with purple
            ctx.fillStyle = "#432FE9";
            ctx.globalAlpha = 0.6 + Math.sin(time / 320) * 0.2;
            ctx.fillRect(
              piece.x * squareSize,
              piece.y * squareSize,
              squareSize,
              squareSize,
            );
            ctx.globalAlpha = 1;
            changed = true;
          }

          const color = teamToColor(piece.team);
          const hash = (color.r << 16) | (color.g << 8) | color.b;

          // Manage cache size
          if (!tintedImgs.has(hash)) {
            if (tintedImgs.size >= MAX_TINTED_CACHE) {
              // Remove oldest entry (first key)
              const firstKey = tintedImgs.keys().next().value;
              tintedImgs.delete(firstKey);
            }
            generateTintedImages(color);
          }

          const tintedArr = tintedImgs.get(hash);

          // Check for interpolation
          const interpKey = `${piece.x},${piece.y}`;
          let renderX = piece.x;
          let renderY = piece.y;

          if (interpolatingPieces && interpolatingPieces[interpKey]) {
            const interp = interpolatingPieces[interpKey];
            // Faster lerp factor for snappier, less juddery movement
            const lerpFactor = 1 - Math.pow(0.001, dt / 1000);
            interp[0] = interpolate(interp[0], piece.x, lerpFactor);
            interp[1] = interpolate(interp[1], piece.y, lerpFactor);

            if (
              Math.abs(interp[0] - piece.x) < 0.01 &&
              Math.abs(interp[1] - piece.y) < 0.01
            ) {
              delete interpolatingPieces[interpKey];
            }

            renderX = interp[0];
            renderY = interp[1];
            changed = true; // Keep rendering during interpolation
          }

          // Apply fade-in effect
          const fadeAlpha = window.getPieceFadeAlpha
            ? window.getPieceFadeAlpha(piece.x, piece.y)
            : 1.0;
          const fadeScale = window.getPieceFadeScale
            ? window.getPieceFadeScale(piece.x, piece.y)
            : 1.0;
          if (fadeAlpha < 1.0 || fadeScale !== 1.0) changed = true; // Keep rendering during fade

          ctx.save();
          ctx.globalAlpha = fadeAlpha;

          if (fadeScale !== 1.0) {
            // Apply scale transform for pop-in effect
            const centerX = renderX * squareSize + squareSize / 2;
            const centerY = renderY * squareSize + squareSize / 2;
            ctx.translate(centerX, centerY);
            ctx.scale(fadeScale, fadeScale);
            ctx.translate(-centerX, -centerY);
          }

          if (tintedArr && tintedArr[piece.type]) {
            ctx.drawImage(
              tintedArr[piece.type],
              renderX * squareSize,
              renderY * squareSize,
            );
          }
          ctx.restore();
        }
      } catch (e) {
        console.error("Piece rendering error:", e);
      }
    }
  }

  // Draw spawn immunity indicator (squircle with pulsing glow)
  if (window.spawnImmunities && window.spawnImmunities.size > 0) {
    try {
      const now = performance.now();
      const expiredImmunities = [];

      for (const [immuneTeam, expiryTime] of window.spawnImmunities) {
        if (now >= expiryTime) {
          expiredImmunities.push(immuneTeam);
          continue;
        }

        // Find the immune piece in visible pieces
        let immunePiece = null;
        for (const p of visiblePieces) {
          if (p.team === immuneTeam && p.type !== 0) {
            immunePiece = p;
            break;
          }
        }
        if (!immunePiece) continue;

        const remaining = expiryTime - now;
        const progress = 1 - remaining / SPAWN_IMMUNITY_MS;
        const pulse = 0.4 + Math.sin(now / 200) * 0.2;
        // Fade out in last 40% of duration
        const fadeAlpha = progress > 0.6 ? (1 - progress) / 0.4 : 1;

        const x = immunePiece.x * squareSize;
        const y = immunePiece.y * squareSize;
        const size = squareSize;
        const cornerRadius = size * 0.25;

        ctx.save();
        ctx.globalAlpha = fadeAlpha * pulse;

        // Squircle outline
        const glowColor = immuneTeam === selfId ? "100, 200, 255" : "200, 200, 100";
        ctx.strokeStyle = `rgba(${glowColor}, ${0.6 * fadeAlpha * pulse})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + cornerRadius, y);
        ctx.lineTo(x + size - cornerRadius, y);
        ctx.quadraticCurveTo(x + size, y, x + size, y + cornerRadius);
        ctx.lineTo(x + size, y + size - cornerRadius);
        ctx.quadraticCurveTo(x + size, y + size, x + size - cornerRadius, y + size);
        ctx.lineTo(x + cornerRadius, y + size);
        ctx.quadraticCurveTo(x, y + size, x, y + size - cornerRadius);
        ctx.lineTo(x, y + cornerRadius);
        ctx.quadraticCurveTo(x, y, x + cornerRadius, y);
        ctx.closePath();
        ctx.stroke();

        // Inner glow
        const glowGrad = ctx.createRadialGradient(
          x + size / 2, y + size / 2, size * 0.2,
          x + size / 2, y + size / 2, size * 0.6
        );
        glowGrad.addColorStop(0, `rgba(${glowColor}, ${0.15 * fadeAlpha * pulse})`);
        glowGrad.addColorStop(1, `rgba(${glowColor}, 0)`);
        ctx.fillStyle = glowGrad;
        ctx.fillRect(x, y, size, size);

        ctx.restore();
        changed = true;
      }

      for (const id of expiredImmunities) {
        window.spawnImmunities.delete(id);
      }
    } catch (e) {
      console.error("Spawn immunity rendering error:", e);
    }
  }

  // Draw nameplates above player-owned pieces (one per team)
  if (window.playerNamesMap) {
    const seenTeams = new Set();
    const playerPieces = visiblePieces.filter((p) => {
      if (p.team === 0 || p.team >= 10000 || seenTeams.has(p.team)) return false;
      seenTeams.add(p.team);
      return true;
    });

    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    const fontSize = Math.max(10, Math.min(14, 14 / camera.scale));
    ctx.font = `600 ${fontSize}px "Sometype Mono", monospace`;

    for (const pp of playerPieces) {
      const info = window.playerNamesMap[pp.team];
      const label = info
        ? info.name
        : pp.team === selfId
          ? window.playerName || "You"
          : `#${pp.team}`;
      const color = teamToColor(pp.team);

      const cx = pp.x * squareSize + squareSize / 2;
      const cy = pp.y * squareSize - 22;

      // Shadow for readability
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      const tw = ctx.measureText(label).width;
      const pad = 4;
      ctx.fillRect(cx - tw / 2 - pad, cy - fontSize - pad, tw + pad * 2, fontSize + pad * 2);

      // Text
      ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
      ctx.fillText(label, cx, cy);
    }
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }

  // Dragging selected piece
  if (
    selectedSquareX !== undefined &&
    draggingSelected === true &&
    window.spatialHash
  ) {
    const piece = window.spatialHash.get(selectedSquareX, selectedSquareY);
    if (piece.type !== 0) {
      // Cover up original square
      if ((selectedSquareX + selectedSquareY) % 2 === 0) {
        ctx.fillStyle = colors[1];
      } else {
        ctx.fillStyle = colors[0];
      }
      ctx.fillRect(
        selectedSquareX * squareSize,
        selectedSquareY * squareSize,
        squareSize,
        squareSize,
      );

      // Draw dragged piece at mouse position
      const color = teamToColor(selfId);
      const hash = `${color.r}_${color.g}_${color.b}`;

      if (!tintedImgs.has(hash)) {
        generateTintedImages(color);
      }

      const tintedArr = tintedImgs.get(hash);
      ctx.drawImage(
        tintedArr[piece.type],
        mousePos.x - squareSize / 2,
        mousePos.y - squareSize / 2,
      );
    }
  }

  // Mouse interactions
  if (mouse && window.spatialHash) {
    mousePos = canvasPos(mouse);

    const squareX = Math.floor(mousePos.x / squareSize);
    const squareY = Math.floor(mousePos.y / squareSize);

    const piece = window.spatialHash.get(squareX, squareY);
    if (piece.type !== 0 && piece.team === selfId) {
      canvas.style.cursor = "grab";
    } else {
      canvas.style.cursor = "";
    }

    // Move cooldown indicator above player's king (smooth timestamp-based)
    const now = performance.now();
    const cooldownTotal = window.moveCooldown || 1500;
    const cooldownRemaining = cooldownEndTime - now;

    if (cooldownRemaining > 0) {
      changed = true; // Keep rendering during cooldown
      const percent = cooldownRemaining / cooldownTotal;

      // Find player's piece from already-queried visible pieces
      let myPiece = null;
      for (const piece of visiblePieces) {
        if (piece.team === selfId) {
          myPiece = piece;
          break;
        }
      }

      if (myPiece) {
        const w = squareSize * 0.8;
        const h = 8;
        const x = myPiece.x * squareSize + (squareSize - w) / 2;
        const y = myPiece.y * squareSize - 15;

        // Background
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.fillRect(x + w * (1 - percent), y, w * percent, h);

        // Foreground (filled part)
        const color = teamToColor(selfId);
        ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.9)`;
        ctx.fillRect(x, y, w * (1 - percent), h);

        // Border
        ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, h);
      }
    }
  }

  // Draw cooldown bars above AI pieces
  if (window.aiCooldowns && window.aiCooldowns.size > 0) {
    const now = performance.now();
    const expiredIds = [];

    for (const [aiTeamId, cd] of window.aiCooldowns) {
      const remaining = cd.endTime - now;
      if (remaining <= 0) {
        expiredIds.push(aiTeamId);
        continue;
      }

      // Find this AI piece in visible pieces
      let aiPiece = null;
      for (const p of visiblePieces) {
        if (p.team === aiTeamId) {
          aiPiece = p;
          break;
        }
      }
      if (!aiPiece) continue;

      const percent = remaining / cd.total;
      const w = squareSize * 0.6;
      const h = 5;
      const x = aiPiece.x * squareSize + (squareSize - w) / 2;
      const y = aiPiece.y * squareSize - 10;

      // Background
      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      ctx.fillRect(x + w * (1 - percent), y, w * percent, h);

      // Foreground (filled part)
      const color = teamToColor(aiTeamId);
      ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.7)`;
      ctx.fillRect(x, y, w * (1 - percent), h);

      // Border
      ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x, y, w, h);

      changed = true;
    }

    // Clean up expired cooldowns
    for (const id of expiredIds) {
      window.aiCooldowns.delete(id);
    }
  }

  // Render capture effects (expanding ring + particle burst)
  if (captureEffects.size > 0) {
    const now = performance.now();
    const expiredEffects = [];

    for (const [key, effect] of captureEffects) {
      const elapsed = now - effect.startTime;
      if (elapsed > CAPTURE_EFFECT_DURATION) {
        expiredEffects.push(key);
        continue;
      }

      const [ex, ey] = key.split(",").map(Number);
      const progress = elapsed / CAPTURE_EFFECT_DURATION;
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const alpha = 1 - progress;

      const centerX = ex * squareSize + squareSize / 2;
      const centerY = ey * squareSize + squareSize / 2;
      const c = effect.color;

      // Expanding ring
      ctx.save();
      ctx.strokeStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha * 0.8})`;
      ctx.lineWidth = Math.max(1, (1 - easeOut) * 6);
      ctx.beginPath();
      ctx.arc(centerX, centerY, squareSize * 0.3 + easeOut * squareSize * 0.6, 0, Math.PI * 2);
      ctx.stroke();

      // Inner flash
      if (progress < 0.3) {
        const flashAlpha = (1 - progress / 0.3) * 0.4;
        ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${flashAlpha})`;
        ctx.fillRect(ex * squareSize, ey * squareSize, squareSize, squareSize);
      }

      // Particle burst (8 particles flying outward)
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2 + effect.startTime * 0.001;
        const dist = easeOut * squareSize * 0.8;
        const px = centerX + Math.cos(angle) * dist;
        const py = centerY + Math.sin(angle) * dist;
        const size = (1 - easeOut) * 4 + 1;

        ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha * 0.9})`;
        ctx.fillRect(px - size / 2, py - size / 2, size, size);
      }

      ctx.restore();
    }

    for (const key of expiredEffects) {
      captureEffects.delete(key);
    }
  }

  // Render invalid click flash (brief red overlay on enemy piece)
  if (invalidClickEffect) {
    const elapsed = performance.now() - invalidClickEffect.time;
    const INVALID_FLASH_DURATION = 300;
    if (elapsed < INVALID_FLASH_DURATION) {
      const alpha = (1 - elapsed / INVALID_FLASH_DURATION) * 0.35;
      ctx.fillStyle = `rgba(255, 60, 60, ${alpha})`;
      ctx.fillRect(
        invalidClickEffect.x * squareSize,
        invalidClickEffect.y * squareSize,
        squareSize,
        squareSize,
      );
      changed = true;
    } else {
      invalidClickEffect = null;
    }
  }

  ctx.setTransform(t);

  // XP bar — evolution progress HUD
  if (selfId !== -1 && !gameOver) {
    const myKills = (window.playerNamesMap && window.playerNamesMap[selfId] && window.playerNamesMap[selfId].kills !== undefined)
      ? window.playerNamesMap[selfId].kills : 0;
    const next = getNextEvolution(myKills);
    const prevKills = getCurrentThresholdKills(myKills);
    const currentPieceType = getEvolutionPiece(myKills, selfId);
    const currentPieceName = PIECE_NAMES[currentPieceType] || "Queen";

    const barW = Math.min(320, canvas.w * 0.4);
    const barH = 14;
    const barX = (canvas.w - barW) / 2;
    const barY = canvas.h - 40;

    // Background
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);

    if (next) {
      const killsIntoTier = myKills - prevKills;
      const tierTotal = next.kills - prevKills;
      const progress = Math.min(1, killsIntoTier / tierTotal);

      // Fill
      const color = teamToColor(selfId);
      ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.7)`;
      ctx.fillRect(barX, barY, barW * progress, barH);

      // Border
      ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
      ctx.lineWidth = 1;
      ctx.strokeRect(barX, barY, barW, barH);

      // Next piece name (resolve -1 for display)
      let nextName = PIECE_NAMES[next.piece] || "?";
      if (next.piece === -1) nextName = "Bishop/Rook";

      // Labels
      ctx.font = "500 10px 'Sometype Mono', monospace";
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
      ctx.fillText(currentPieceName.toUpperCase(), barX, barY - 4);

      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
      ctx.fillText(`${next.kills - myKills} → ${nextName}`, barX + barW, barY - 4);

      // Kill count inside bar
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      ctx.fillText(`${myKills} / ${next.kills}`, barX + barW / 2, barY + barH - 3);
    } else {
      // Fully evolved — fill bar completely
      const color = teamToColor(selfId);
      ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.7)`;
      ctx.fillRect(barX, barY, barW, barH);

      ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
      ctx.lineWidth = 1;
      ctx.strokeRect(barX, barY, barW, barH);

      ctx.font = "500 10px 'Sometype Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      ctx.fillText(`${currentPieceName.toUpperCase()} — FINAL FORM`, barX + barW / 2, barY + barH - 3);
    }

    ctx.textAlign = "left"; // Reset
  }


  // Game over screen
  if (gameOver === true) {
    try {
      gameOverAlpha = interpolate(gameOverAlpha, 1, (dt / 16.66) * 0.08);
      changed = true;

      // Dark overlay
      ctx.fillStyle = `rgba(0, 0, 0, ${gameOverAlpha * 0.65})`;
      ctx.fillRect(0, 0, canvas.w, canvas.h);

      // Red vignette
      const vigGrad = ctx.createRadialGradient(
        canvas.w / 2, canvas.h / 2, canvas.w * 0.2,
        canvas.w / 2, canvas.h / 2, canvas.w * 0.7,
      );
      vigGrad.addColorStop(0, "rgba(180, 0, 0, 0)");
      vigGrad.addColorStop(1, `rgba(120, 0, 0, ${gameOverAlpha * 0.3})`);
      ctx.fillStyle = vigGrad;
      ctx.fillRect(0, 0, canvas.w, canvas.h);

      const centerX = canvas.w / 2;
      const centerY = canvas.h / 2;
      const bob = Math.sin(time / 400) * 4;

      // "ELIMINATED" title
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.globalAlpha = gameOverAlpha;

      ctx.font = "700 52px 'Sometype Mono', monospace";
      ctx.fillStyle = "#ff4444";
      ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
      ctx.lineWidth = 6;
      ctx.strokeText("ELIMINATED", centerX, centerY + bob - 50);
      ctx.fillText("ELIMINATED", centerX, centerY + bob - 50);

      // Killer info
      const killer = window.gameOverKiller || "Unknown";
      ctx.font = "500 20px 'Sometype Mono', monospace";
      ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
      ctx.lineWidth = 3;
      ctx.strokeText(`killed by ${killer}`, centerX, centerY + bob - 15);
      ctx.fillText(`killed by ${killer}`, centerX, centerY + bob - 15);

      // Respawn countdown
      const remaining = Math.max(0, gameOverTime + respawnTime - time);
      const progress = 1 - remaining / respawnTime;
      const seconds = (remaining / 1000).toFixed(1);

      // Countdown bar background
      const barW = 260;
      const barH = 8;
      const barX = centerX - barW / 2;
      const barY = centerY + bob + 25;

      ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
      ctx.fillRect(barX, barY, barW, barH);

      // Countdown bar fill
      ctx.fillStyle = `rgba(255, 68, 68, ${0.5 + progress * 0.5})`;
      ctx.fillRect(barX, barY, barW * progress, barH);

      // Respawn text
      ctx.font = "500 16px 'Sometype Mono', monospace";
      ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
      ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
      ctx.lineWidth = 2;
      ctx.strokeText(`respawning in ${seconds}s`, centerX, centerY + bob + 52);
      ctx.fillText(`respawning in ${seconds}s`, centerX, centerY + bob + 52);

      ctx.globalAlpha = 1;
    } catch (e) {
      console.error("Game over rendering error:", e);
    }
  }

  changed = false;
  // Update floating chat bubbles
  if (window.updateChatBubbles) {
    window.updateChatBubbles();
  }

  // Update statistics panel
  if (selfId !== -1) {
    document.getElementById("stat-name").textContent =
      window.playerName || "UNKNOWN";
    document.getElementById("stat-color").textContent =
      window.playerColor || "-";
    document.getElementById("stat-mode").textContent = window.infiniteMode
      ? "INFINITE"
      : "64x64";

    // Find player's piece position from visible pieces (already queried)
    if (visiblePieces.length > 0) {
      let myX = null;
      let myY = null;
      let myPieceCount = 0;

      for (const piece of visiblePieces) {
        if (piece.team === selfId) {
          myPieceCount++;
          if (myX === null) {
            myX = piece.x;
            myY = piece.y;
          }
        }
      }

      if (myX !== null && myY !== null) {
        window.myKingX = myX;
        window.myKingY = myY;
        document.getElementById("stat-pos").textContent = toChessNotation(myX, myY);
      } else {
        document.getElementById("stat-pos").textContent = "---";
      }

      document.getElementById("stat-pieces").textContent = myPieceCount;
    }

    // Update move range and evolution display
    const myKills = (window.playerNamesMap && window.playerNamesMap[selfId])
      ? window.playerNamesMap[selfId].kills : 0;
    const rangeEl = document.getElementById("stat-range");
    if (rangeEl) {
      rangeEl.textContent = getMoveRange(myKills);
    }

    const pieceEl = document.getElementById("stat-piece");
    if (pieceEl) {
      const currentPieceType = getEvolutionPiece(myKills, selfId);
      pieceEl.textContent = PIECE_NAMES[currentPieceType] || "Queen";
    }

    const nextEvoEl = document.getElementById("stat-next-evo");
    if (nextEvoEl) {
      const next = getNextEvolution(myKills);
      if (next) {
        let nextName = PIECE_NAMES[next.piece] || "?";
        if (next.piece === -1) nextName = "Bishop/Rook";
        nextEvoEl.textContent = `${next.kills - myKills} kills → ${nextName}`;
      } else {
        nextEvoEl.textContent = "MAX";
      }
    }

    document.getElementById("stat-zoom").textContent =
      camera.scale.toFixed(2) + "x";
  }

  // Update piece hover tooltip
  updatePieceTooltip();
}


// Pastel color palette shared by players and AI
const PASTEL_PALETTE = [
  { r: 255, g: 179, b: 186 }, // #FFB3BA - pink
  { r: 186, g: 255, b: 201 }, // #BAFFC9 - mint
  { r: 186, g: 225, b: 255 }, // #BAE1FF - blue
  { r: 255, g: 255, b: 186 }, // #FFFFBA - yellow
  { r: 255, g: 186, b: 243 }, // #FFBAF3 - magenta
  { r: 186, g: 255, b: 255 }, // #BFFFFF - cyan
  { r: 255, g: 217, b: 186 }, // #FFD9BA - orange
  { r: 231, g: 186, b: 255 }, // #E7BAFF - purple
];

// Seeded rng
function teamToColor(team) {
  // Use player's chosen color for their own team
  if (team === selfId && window.playerColor) {
    const hex = window.playerColor;
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result) {
      return {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      };
    }
  }

  // AI pieces (id >= 10000) use pastel palette
  if (team >= 10000) {
    return PASTEL_PALETTE[team % PASTEL_PALETTE.length];
  }

  // Other players also use pastel palette for consistency
  return PASTEL_PALETTE[Math.abs(team) % PASTEL_PALETTE.length];
}

function generateTintedImages(color) {
  let arr = [undefined];

  const r = color.r / 256;
  const g = color.g / 256;
  const b = color.b / 256;

  for (let i = 1; i < imgs.length; i++) {
    const c = document.createElement("canvas");
    const cx = c.getContext("2d");
    c.width = c.height = squareSize;

    cx.drawImage(imgs[i], 0, 0);

    const imgData = cx.getImageData(0, 0, c.width, c.height);
    const data = imgData.data;
    for (let j = 0; j < data.length; j += 4) {
      data[j] *= r;
      data[j + 1] *= g;
      data[j + 2] *= b;
    }

    cx.clearRect(0, 0, c.width, c.height);
    cx.putImageData(imgData, 0, 0);

    arr.push(c);
  }

  tintedImgs.set((color.r << 16) | (color.g << 8) | color.b, arr);
}

// Screen position to world position using camera state
// Works both inside and outside the render loop
function canvasPos({ x, y }) {
  const canvasDimensions = canvas.getBoundingClientRect();
  // Convert page coords to canvas pixel coords
  const cx = ((x - canvasDimensions.x) / canvasDimensions.width) * canvas.width;
  const cy = ((y - canvasDimensions.y) / canvasDimensions.height) * canvas.height;

  // Invert the camera transform: translate(w/2,h/2) -> scale -> translate(cam)
  // World = (screen - w/2) / scale - camera
  const worldX = (cx - canvas.width / 2) / camera.scale - camera.x;
  const worldY = (cy - canvas.height / 2) / camera.scale - camera.y;

  return { x: worldX, y: worldY };
}

// Recenter button
document.getElementById("recenterBtn").addEventListener("click", () => {
  if (window.myKingX !== undefined && window.myKingY !== undefined) {
    camera.x = -(window.myKingX * squareSize + squareSize / 2);
    camera.y = -(window.myKingY * squareSize + squareSize / 2);
    changed = true;
  }
});

// Force respawn button (debug)
document.getElementById("forceRespawnBtn").addEventListener("click", () => {
  console.log("🔄 Force respawn triggered");
  window._hadMyPiece = false;
  gameOver = false;
  gameOverTime = undefined;
  gameOverAlpha = 0;
  // Re-send player info to trigger a fresh spawn on server
  if (window.sendPlayerInfo) {
    window.sendPlayerInfo();
  }
});

// Piece hover tooltip
const pieceTooltip = document.getElementById("pieceTooltip");
let lastTooltipSquare = null;

function updatePieceTooltip() {
  if (!mouse || !window.spatialHash || selfId === -1) {
    pieceTooltip.classList.add("hidden");
    lastTooltipSquare = null;
    return;
  }

  const wp = canvasPos(mouse);
  const sx = Math.floor(wp.x / squareSize);
  const sy = Math.floor(wp.y / squareSize);
  const key = `${sx},${sy}`;

  const piece = window.spatialHash.get(sx, sy);
  if (piece.type === 0) {
    pieceTooltip.classList.add("hidden");
    lastTooltipSquare = null;
    return;
  }

  // Only rebuild HTML when hovering a new square
  if (lastTooltipSquare !== key) {
    lastTooltipSquare = key;
    const notation = toChessNotation(sx, sy);
    const pieceName = PIECE_NAMES[piece.type] || "Unknown";
    const color = teamToColor(piece.team);
    const colorHex = `rgb(${color.r},${color.g},${color.b})`;

    let ownerName = "Neutral";
    if (piece.team !== 0) {
      if (piece.team === selfId) {
        ownerName = window.playerName || "You";
      } else {
        // Check playerNamesMap for name
        const entry = window.playerNamesMap && window.playerNamesMap[piece.team];
        ownerName = entry ? entry.name : `Player ${piece.team}`;
      }
    }

    let html = `<div class="tooltip-title">${pieceName} @ ${notation}</div>`;
    if (piece.team !== 0) {
      html += `<div class="tooltip-row"><span class="tooltip-label">OWNER:</span><span><span class="tooltip-color" style="background:${colorHex}"></span>${ownerName}</span></div>`;
    } else {
      html += `<div class="tooltip-row"><span class="tooltip-label">STATUS:</span><span>Neutral</span></div>`;
    }
    html += `<div class="tooltip-row"><span class="tooltip-label">SQUARE:</span><span>${notation}</span></div>`;
    html += `<div class="tooltip-row"><span class="tooltip-label">GRID:</span><span>${sx}, ${sy}</span></div>`;

    pieceTooltip.innerHTML = html;
  }

  // Position tooltip near mouse
  const offsetX = 16;
  const offsetY = 16;
  let tx = mouse.clientX + offsetX;
  let ty = mouse.clientY + offsetY;

  // Keep tooltip on screen
  const tw = pieceTooltip.offsetWidth || 150;
  const th = pieceTooltip.offsetHeight || 80;
  if (tx + tw > window.innerWidth) tx = mouse.clientX - tw - 8;
  if (ty + th > window.innerHeight) ty = mouse.clientY - th - 8;

  pieceTooltip.style.left = tx + "px";
  pieceTooltip.style.top = ty + "px";
  pieceTooltip.classList.remove("hidden");
}

// MOBILE TOUCH HANDLERS
const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || ('ontouchstart' in window);

let touchState = {
  panning: false,
  pinching: false,
  startX: 0,
  startY: 0,
  camStartX: 0,
  camStartY: 0,
  lastDist: 0,
  lastMidX: 0,
  lastMidY: 0,
  moved: false,
};

function getTouchDist(t1, t2) {
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function getTouchMid(t1, t2) {
  return {
    x: (t1.clientX + t2.clientX) / 2,
    y: (t1.clientY + t2.clientY) / 2,
  };
}

canvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  document.body.classList.add("touching");

  if (e.touches.length === 2) {
    // Pinch-to-zoom start
    touchState.pinching = true;
    touchState.panning = false;
    touchState.lastDist = getTouchDist(e.touches[0], e.touches[1]);
    const mid = getTouchMid(e.touches[0], e.touches[1]);
    touchState.lastMidX = mid.x;
    touchState.lastMidY = mid.y;
    touchState.camStartX = camera.x;
    touchState.camStartY = camera.y;
  } else if (e.touches.length === 1) {
    // Single touch pan start
    touchState.panning = true;
    touchState.pinching = false;
    touchState.startX = e.touches[0].clientX;
    touchState.startY = e.touches[0].clientY;
    touchState.camStartX = camera.x;
    touchState.camStartY = camera.y;
    touchState.moved = false;
  }
}, { passive: false });

canvas.addEventListener("touchmove", (e) => {
  e.preventDefault();

  if (touchState.pinching && e.touches.length === 2) {
    // Pinch-to-zoom
    const newDist = getTouchDist(e.touches[0], e.touches[1]);
    const mid = getTouchMid(e.touches[0], e.touches[1]);
    const scaleFactor = newDist / touchState.lastDist;

    const oldScale = camera.scale;
    camera.scale *= scaleFactor;
    if (camera.scale > 6) camera.scale = 6;
    if (camera.scale < 0.27) camera.scale = 0.27;

    // Zoom toward pinch midpoint
    const rect = canvas.getBoundingClientRect();
    const mx = ((mid.x - rect.x) / rect.width) * canvas.width;
    const my = ((mid.y - rect.y) / rect.height) * canvas.height;
    const cx = mx - canvas.width / 2;
    const cy = my - canvas.height / 2;
    camera.x = cx / camera.scale - (cx / oldScale - camera.x);
    camera.y = cy / camera.scale - (cy / oldScale - camera.y);

    // Also pan with the midpoint movement
    const midDx = mid.x - touchState.lastMidX;
    const midDy = mid.y - touchState.lastMidY;
    camera.x += midDx / camera.scale;
    camera.y += midDy / camera.scale;

    touchState.lastDist = newDist;
    touchState.lastMidX = mid.x;
    touchState.lastMidY = mid.y;
    changed = true;
  } else if (touchState.panning && e.touches.length === 1) {
    // Single touch pan
    const dx = e.touches[0].clientX - touchState.startX;
    const dy = e.touches[0].clientY - touchState.startY;
    camera.x = touchState.camStartX + dx / camera.scale;
    camera.y = touchState.camStartY + dy / camera.scale;

    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) touchState.moved = true;
    changed = true;
  }
}, { passive: false });

canvas.addEventListener("touchend", (e) => {
  e.preventDefault();

  if (e.touches.length === 0) {
    // If single tap (no pan movement), treat as a click for piece selection
    if (touchState.panning && !touchState.moved && !touchState.pinching) {
      const touch = e.changedTouches[0];
      const pos = canvasPos({ x: touch.clientX, y: touch.clientY });
      const squareX = Math.floor(pos.x / squareSize);
      const squareY = Math.floor(pos.y / squareSize);

      // Check if tapping a legal move
      if (legalMoves !== undefined && selectedSquareX !== undefined) {
        for (let i = 0; i < legalMoves.length; i++) {
          if (legalMoves[i][0] === squareX && legalMoves[i][1] === squareY && performance.now() >= cooldownEndTime) {
            const buf = new Int32Array(5);
            buf[0] = 55550;
            buf[1] = selectedSquareX;
            buf[2] = selectedSquareY;
            buf[3] = squareX;
            buf[4] = squareY;
            send(buf);
            legalMoves = [];
            selectedSquareX = squareX;
            selectedSquareY = squareY;
            cooldownEndTime = performance.now() + (window.moveCooldown || 1500);
            changed = true;
            touchState.panning = false;
            touchState.pinching = false;
            document.body.classList.remove("touching");
            return;
          }
        }
      }

      // Select own piece
      selectedSquareX = selectedSquareY = undefined;
      legalMoves = undefined;
      if (window.spatialHash) {
        const piece = window.spatialHash.get(squareX, squareY);
        if (piece.type !== 0 && piece.team === selfId) {
          selectedSquareX = squareX;
          selectedSquareY = squareY;
          const myKills = (window.playerNamesMap && window.playerNamesMap[selfId]) ? window.playerNamesMap[selfId].kills : 0;
          legalMoves = generateLegalMoves(selectedSquareX, selectedSquareY, window.spatialHash, selfId, myKills);
        }
      }
      changed = true;
    }

    touchState.panning = false;
    touchState.pinching = false;
    document.body.classList.remove("touching");
  } else if (e.touches.length === 1) {
    // Went from 2 fingers to 1 — restart pan from current position
    touchState.pinching = false;
    touchState.panning = true;
    touchState.startX = e.touches[0].clientX;
    touchState.startY = e.touches[0].clientY;
    touchState.camStartX = camera.x;
    touchState.camStartY = camera.y;
    touchState.moved = true;
  }
}, { passive: false });

function interpolate(s, e, t) {
  return (1 - t) * s + e * t;
}

// Panel collapse/expand functionality (runs immediately — DOM is already ready since scripts are at bottom of body)
{
  const statsPanel = document.getElementById("stats-panel");
  const statsCollapse = document.getElementById("stats-collapse");
  const statsExpand = document.getElementById("stats-expand");

  if (statsCollapse && statsExpand && statsPanel) {
    statsCollapse.addEventListener("click", (e) => {
      e.stopPropagation();
      statsPanel.classList.add("hidden");
      statsExpand.classList.remove("hidden");
    });
    statsExpand.addEventListener("click", (e) => {
      e.stopPropagation();
      statsPanel.classList.remove("hidden");
      statsExpand.classList.add("hidden");
    });
  }

  const lbDiv = document.querySelector(".leaderboard-div");
  const lbCollapse = document.getElementById("lb-collapse");
  const lbExpand = document.getElementById("lb-expand");

  if (lbCollapse && lbExpand && lbDiv) {
    lbCollapse.addEventListener("click", (e) => {
      e.stopPropagation();
      lbDiv.classList.add("hidden");
      lbExpand.classList.remove("hidden");
    });
    lbExpand.addEventListener("click", (e) => {
      e.stopPropagation();
      lbDiv.classList.remove("hidden");
      lbExpand.classList.add("hidden");
    });
  }

  const followToggle = document.getElementById("followToggle");
  window.followCamera = false;
  if (followToggle) {
    followToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      window.followCamera = !window.followCamera;
      followToggle.textContent = window.followCamera ? "ON" : "OFF";
      followToggle.classList.toggle("on", window.followCamera);
      followToggle.classList.toggle("off", !window.followCamera);
      changed = true;
    });
  }
}
