let ws = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 8;
const BASE_RECONNECT_DELAY = 1000; // 1s, doubles each attempt
let connected = false;
const msgs = [];

function connectWebSocket() {
  ws = new WebSocket(HOST);
  ws.binaryType = "arraybuffer";
  setupWebSocketHandlers();
}

window.selfId = -1;
window.playerName = "";
window.playerColor = "#FFB3BA"; // Default pastel pink (matches first swatch)
window.playerPiece = 6; // Default to king (evolution start)

// Spatial hash on client side
const spatialHash = new SpatialHash();
window.spatialHash = spatialHash;

// Store for interpolating piece movements
let interpolatingPieces = {};

// Piece fade in/out system - tracks opacity transitions
// Key: "x,y" -> { alpha: 0-1, target: 0 or 1, startTime: timestamp }
const pieceFades = new Map();
const FADE_DURATION = 400; // ms for fade in/out

window.getPieceFadeAlpha = (x, y) => {
  const key = `${x},${y}`;
  const fade = pieceFades.get(key);
  if (!fade) return 1.0;
  const elapsed = performance.now() - fade.startTime;
  const t = Math.min(1, elapsed / FADE_DURATION);
  const alpha = fade.target === 1 ? t : 1 - t;
  if (t >= 1) {
    if (fade.target === 1) pieceFades.delete(key);
    // fade-out entries cleaned up after removal
  }
  return Math.max(0, Math.min(1, alpha));
};

window.getPieceFadeScale = (x, y) => {
  const key = `${x},${y}`;
  const fade = pieceFades.get(key);
  if (!fade) return 1.0;
  const elapsed = performance.now() - fade.startTime;
  const t = Math.min(1, elapsed / FADE_DURATION);
  if (fade.target === 1) {
    // Pop-in: scale from 0.7 to 1.0
    return 0.7 + 0.3 * t;
  } else {
    // Fade-out: scale from 1.0 to 0.7
    return 1.0 - 0.3 * t;
  }
};

function startFadeIn(x, y) {
  pieceFades.set(`${x},${y}`, { target: 1, startTime: performance.now() });
  changed = true;
}

function startFadeOut(x, y) {
  pieceFades.set(`${x},${y}`, { target: 0, startTime: performance.now() });
  changed = true;
}

// Track AI piece cooldowns for rendering bars
// Key: aiTeamId -> { endTime: timestamp, total: ms }
window.aiCooldowns = new Map();

// Active chat bubbles
const activeChatBubbles = new Map(); // playerId -> { text, time, element }


function setupWebSocketHandlers() {
ws.addEventListener("message", function (data) {
  try {
    const u8 = new Uint8Array(data.data);
    // Use Int32Array for coordinate messages, Uint16Array for legacy text messages
    const i32 = data.data.byteLength >= 4 && data.data.byteLength % 4 === 0
      ? new Int32Array(data.data) : null;
    const msg = new Uint16Array(data.data.byteLength % 2 === 0 ? data.data : new ArrayBuffer(0));

  // Viewport sync (initial or periodic update) — Int32Array
  if (i32 && i32[0] === 55553) {
    const isFirstSync = selfId === -1;
    selfId = i32[1];
    const count = i32[2];
    window.infiniteMode = i32[3] === 1;

    console.log(
      `🔄 Viewport sync: selfId=${selfId}, pieces=${count}, infiniteMode=${window.infiniteMode}, isFirstSync=${isFirstSync}`,
    );

    // Diff-based viewport sync (P6) — only add/remove changed pieces
    // Build map of old pieces for comparison
    const oldPieces = spatialHash.getAllPieces();
    const oldPieceMap = new Map(); // "x,y" -> {type, team}
    for (const p of oldPieces) {
      if (p.type !== 0) oldPieceMap.set(`${p.x},${p.y}`, { type: p.type, team: p.team });
    }

    let i = 4; // Start after magic, selfId, count, infiniteMode
    let myPieceX = null;
    let myPieceY = null;
    const newPieceKeys = new Set();

    for (let j = 0; j < count; j++) {
      const x = i32[i++];
      const y = i32[i++];
      const type = i32[i++];
      const team = i32[i++];
      const key = `${x},${y}`;
      newPieceKeys.add(key);

      const old = oldPieceMap.get(key);
      // Only update spatial hash if piece changed or is new
      if (!old || old.type !== type || old.team !== team) {
        spatialHash.set(x, y, type, team);
        if (!old) startFadeIn(x, y); // Fade in only truly new pieces
      }

      // Find player's piece to center camera (any piece owned by us)
      if (team === selfId && myPieceX === null) {
        myPieceX = x;
        myPieceY = y;
      }
    }

    // Remove pieces that are no longer in the viewport
    for (const [key, old] of oldPieceMap) {
      if (!newPieceKeys.has(key)) {
        const [ox, oy] = key.split(",").map(Number);
        spatialHash.set(ox, oy, 0, 0);
      }
    }

    // Center camera on our piece if we just spawned (had no piece before)
    const hadPieceBefore = window._hadMyPiece || false;
    console.log(`📍 Viewport: myPiece=(${myPieceX},${myPieceY}), hadBefore=${hadPieceBefore}, selfId=${selfId}`);
    if (myPieceX !== null && myPieceY !== null && !hadPieceBefore) {
      camera.x = -(myPieceX * squareSize + squareSize / 2);
      camera.y = -(myPieceY * squareSize + squareSize / 2);
      console.log(`📍 Camera centered on (${myPieceX}, ${myPieceY})`);
    }
    window._hadMyPiece = myPieceX !== null;

    // Show chat UI and leaderboard after first sync
    if (isFirstSync) {
      const chatContainer = document.querySelector(".chatContainer");
      chatContainer.classList.remove("hidden");

      // On mobile, hide leaderboard by default — show expand tab instead
      if (window.innerWidth <= 768) {
        const lbDiv = document.querySelector(".leaderboard-div");
        const lbExpand = document.getElementById("lb-expand");
        if (lbDiv) lbDiv.classList.add("hidden");
        if (lbExpand) lbExpand.classList.remove("hidden");
      }
    }

    changed = true;
    return;
  }

  // Set square (single piece update) — Int32Array
  else if (i32 && i32[0] === 55555 && data.data.byteLength === 20) {
    const x = i32[1];
    const y = i32[2];
    const piece = i32[3];
    const team = i32[4];

    if (team === selfId) {
      console.log(`🎯 setSquare for OUR piece: x=${x}, y=${y}, type=${piece}, team=${team}`);
    }

    const oldPiece = spatialHash.get(x, y);

    spatialHash.set(x, y, piece, team);

    // Fade in new pieces, fade out removed pieces
    if (piece !== 0 && oldPiece.type === 0) {
      startFadeIn(x, y);
    }

    // Our piece: detect spawn vs evolution
    if (piece !== 0 && team === selfId) {
      const isEvolution = oldPiece.team === selfId && oldPiece.type !== 0 && oldPiece.type !== piece;
      const isSpawn = oldPiece.type === 0 || oldPiece.team !== selfId;

      if (isEvolution) {
        // Evolution — show toast, don't recenter camera
        const pieceName = PIECE_NAMES[piece] || "piece";
        window.showToast(`EVOLVED → ${pieceName.toUpperCase()}`, "info", 3000);
      }

      if (isSpawn) {
        // Spawn or respawn — reset game state and recenter
        gameOver = false;
        gameOverTime = undefined;
        gameOverAlpha = 0;
        window.gameOverKiller = null;
        interpSquare = [x, y];

        camera.x = -(x * squareSize + squareSize / 2);
        camera.y = -(y * squareSize + squareSize / 2);

        cooldownEndTime = 0;

        setTimeout(() => {
          if (gameOver === false) interpSquare = undefined;
        }, 1200);
      }
    }

    changed = true;
    return;
  }

  // Move piece — Int32Array
  else if (i32 && i32[0] === 55554 && data.data.byteLength === 24) {
    const startX = i32[1];
    const startY = i32[2];
    const finX = i32[3];
    const finY = i32[4];
    const playerId = i32[5];

    const movingPiece = spatialHash.get(startX, startY);
    const endPiece = spatialHash.get(finX, finY);
    const isCapture = endPiece.type !== 0;

    // Detect if WE were captured (our piece is at the destination)
    const weWereCaptured = isCapture && endPiece.team === selfId && playerId !== selfId;

    // Update spatial hash: move piece from start to finish
    if (movingPiece.type !== 0) {
      spatialHash.set(startX, startY, 0, 0);
      spatialHash.set(finX, finY, movingPiece.type, playerId);
    }

    // Play sounds for all visible captures/moves (not just self)
    if (audioLoaded === true) {
      try {
        if (isCapture) {
          const snd = audios.capture[Math.random() < 0.5 ? 1 : 0].cloneNode();
          snd.volume = playerId === selfId ? 1.0 : 0.4;
          snd.play();
        } else if (playerId === selfId) {
          audios.move[Math.random() < 0.5 ? 0 : 1].play();
        }
        if (weWereCaptured && audios.gameover) {
          try { audios.gameover[0].play(); } catch (e2) {}
        }
      } catch (e) {}
    }

    // Visual capture effect on the capture square
    if (isCapture && window.triggerCaptureEffect) {
      const attackerColor = teamToColor(playerId);
      window.triggerCaptureEffect(finX, finY, attackerColor, endPiece.type);
    }

    // If we were captured, trigger game over
    if (weWereCaptured) {
      gameOver = true;
      gameOverTime = performance.now();
      gameOverAlpha = 0;
      // Determine killer name
      const killerData = window.playerNamesMap && window.playerNamesMap[playerId];
      window.gameOverKiller = killerData ? killerData.name : (playerId >= 10000 ? "AI" : "Player #" + playerId);
      selectedSquareX = selectedSquareY = undefined;
      legalMoves = undefined;
      draggingSelected = false;
      moveWasDrag = false;
    }

    // Track AI cooldowns for rendering cooldown bars
    if (playerId >= 10000) {
      window.aiCooldowns.set(playerId, {
        endTime: performance.now() + moveCooldown,
        total: moveCooldown,
      });
    }

    // PostHog: track move event (only for self moves to reduce noise)
    if (playerId === selfId && window.posthog && window.posthog.capture) {
      window.posthog.capture('piece_moved', {
        from_x: startX,
        from_y: startY,
        to_x: finX,
        to_y: finY,
        piece_type: movingPiece.type,
        is_capture: isCapture,
      });
      if (window.posthog.flush) window.posthog.flush();
    }

    // Clear selection if our piece moved (server confirmed)
    if (playerId === selfId) {
      if (selectedSquareX === startX && selectedSquareY === startY) {
        unconfirmedSX =
          unconfirmedSY =
          selectedSquareX =
          selectedSquareY =
            undefined;
        legalMoves = undefined;
        draggingSelected = false;
        moveWasDrag = false;
      }
    }

    changed = true;
    return;
  }

  // Spawn immunity notification
  else if (msg[0] === 55556 && msg.byteLength === 6) {
    const immunePlayerId = msg[1];
    const durationMs = msg[2] * 100; // Convert from 100ms units
    window.spawnImmunities = window.spawnImmunities || new Map();
    window.spawnImmunities.set(immunePlayerId, performance.now() + durationMs);

    // If it's us, reset game over state
    if (immunePlayerId === selfId) {
      gameOver = false;
      gameOverAlpha = 0;
      window.gameOverKiller = null;
    }

    changed = true;
    return;
  }

  // Session token assignment from server (magic 55559 + 32-byte token)
  else if (msg[0] === 55559 && data.data.byteLength === 34) {
    const token = decodeText(u8, 2, 34);
    window._sessionToken = token;
    try { sessionStorage.setItem('infinichess_session', token); } catch (e) {}
    console.log('🔑 Session token received');
    return;
  }

  // Session resume response (magic 55558)
  else if (msg[0] === 55558) {
    const status = msg[1];
    if (status === 1 && data.data.byteLength >= 19) {
      // Session restored — read player data
      const restoredId = msg[2];
      const restoredKills = msg[3];
      const restoredPieceType = msg[4];
      const resumeDV = new DataView(data.data);
      const restoredX = resumeDV.getInt32(10, true);
      const restoredY = resumeDV.getInt32(14, true);
      const nameLen = u8[18];
      const restoredName = decodeText(u8, 19, 19 + nameLen);

      selfId = restoredId;
      window.playerName = restoredName;
      window._hadMyPiece = true;

      // Center camera on restored piece
      camera.x = -(restoredX * squareSize + squareSize / 2);
      camera.y = -(restoredY * squareSize + squareSize / 2);

      // Hide setup modal, show game UI
      const setupDiv = document.getElementById("playerSetupDiv");
      if (setupDiv) setupDiv.classList.add("hidden");
      const chatContainer = document.querySelector(".chatContainer");
      if (chatContainer) chatContainer.classList.remove("hidden");
      const statsPanel = document.getElementById("stats-panel");
      const statsExpand = document.getElementById("stats-expand");
      if (window.innerWidth <= 768) {
        if (statsExpand) statsExpand.classList.remove("hidden");
      } else {
        if (statsPanel) statsPanel.classList.remove("hidden");
      }

      // Show Steam wishlist button
      const steamOpenBtnRestore = document.getElementById("steam-panel-open");
      if (steamOpenBtnRestore) steamOpenBtnRestore.classList.remove("hidden");

      gameOver = false;
      gameOverAlpha = 0;
      window.gameOverKiller = null;

      window.showToast("Session restored!", "info", 2000);
      console.log(`✅ Session resumed: ${restoredName} (#${restoredId}) at (${restoredX},${restoredY}) with ${restoredKills} kills`);
    } else {
      // Session rejected — clear stored token, flush queued messages, show setup modal
      window._sessionToken = null;
      selfId = -1;
      try { sessionStorage.removeItem('infinichess_session'); } catch (e) {}
      console.log('❌ Session resume rejected — starting fresh');
      // Flush any queued messages from before the reconnect
      for (let q = 0; q < msgs.length; q++) {
        ws.send(msgs[q]);
      }
      msgs.length = 0;
    }
    changed = true;
    return;
  }

  // Neutralize team (player disconnected)
  else if (msg[0] === 64535 && msg[1] === 12345) {
    const teamsToNeutralize = [];
    for (let i = 2; i < msg.length; i++) {
      teamsToNeutralize.push(msg[i]);
    }

    // Find and neutralize all pieces belonging to disconnected teams
    const allPieces = spatialHash.getAllPieces();
    for (const piece of allPieces) {
      if (teamsToNeutralize.includes(piece.team)) {
        spatialHash.set(piece.x, piece.y, piece.type, 0);
      }
    }

    changed = true;
    return;
  }

  // Chat message
  else if (msg[0] === 47095) {
    const playerId = msg[1];
    const txt = stringHTMLSafe(decodeText(u8, 4)).replaceAll("&nbsp;", " ");

    // Add to chat log
    if (playerId !== 65534) {
      const color = teamToColor(playerId);
      const colorStr = `rgb(${color.r},${color.g},${color.b})`;
      const info = window.playerNamesMap && window.playerNamesMap[playerId];
      const name = info ? info.name : `#${playerId}`;
      const kills = info ? info.kills : 0;
      appendChatMessage(txt, colorStr, name, kills);

      // Show floating bubble
      showChatBubble(playerId, txt);
    } else {
      appendChatMessage(txt, "rainbow", "[Server]", -1);
    }
    return;
  }

  // Leaderboard
  else if (msg[0] === 48027) {
    // Extract online player count
    const onlineCount = msg[1];
    const onlineCountElement = document.getElementById("onlineCount");
    if (onlineCountElement) {
      onlineCountElement.textContent = `${onlineCount} ONLINE`;
    }

    let i = 2; // Start after magic number and online count
    const arr = [];

    while (i + 2 < msg.length) {
      const id = msg[i++];
      const kills = msg[i++];
      const len = msg[i++];
      const startByteInd = i * 2;
      const name = decodeText(u8, startByteInd, startByteInd + len);
      i += Math.ceil(len / 2);

      const color = teamToColor(id);
      arr.push({ name, id, kills, color });
    }

    arr.sort((a, b) => b.kills - a.kills);

    // Update global player names map for nameplates
    if (!window.playerNamesMap) window.playerNamesMap = {};
    for (let i = 0; i < arr.length; i++) {
      const { name, id, kills, color } = arr[i];
      const oldKills = window.playerNamesMap[id] ? window.playerNamesMap[id].kills : 0;
      window.playerNamesMap[id] = { name, kills, color };
      
      // PostHog: track kill milestones for self
      if (id === selfId && kills > oldKills && window.posthog && window.posthog.capture) {
        window.posthog.capture('player_kill_milestone', {
          total_kills: kills,
          kills_this_update: kills - oldKills,
        });
        if (window.posthog.flush) window.posthog.flush();
      }
    }

    // Animated leaderboard update
    updateLeaderboard(arr);
    return;
  }

  // All-time top 3 leaderboard
  else if (msg[0] === 48028) {
    const count = msg[1];
    let i = 2;
    const top3 = [];

    for (let j = 0; j < count; j++) {
      const kills = msg[i++];
      const nameLen = msg[i++];
      const startByteInd = i * 2;
      const name = decodeText(u8, startByteInd, startByteInd + nameLen);
      i += Math.ceil(nameLen / 2);
      // Read color (4 bytes packed into 2 u16 slots)
      const r = u8[i * 2];
      const g = u8[i * 2 + 1];
      const b = u8[i * 2 + 2];
      i += 2;
      top3.push({ name, kills, color: { r, g, b } });
    }

    updateTop3Leaderboard(top3);
    return;
  }
  } catch (error) {
    if (window.errorTracker) {
      window.errorTracker.captureError({
        type: 'websocket_message_handler_error',
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      });
    }
    console.error('❌ Error processing WebSocket message:', error);
  }
});

window.send = (data) => {
  msgs.push(data);
};

ws.onopen = () => {
  try {
    connected = true;
    reconnectAttempts = 0;
    console.log("✓ WebSocket connected");
    if (window.posthog && window.posthog.capture) {
      window.posthog.capture('ws_connected');
      if (window.posthog.flush) window.posthog.flush();
    }
    window.send = (data) => {
      ws.send(data);
    };

    // On reconnect, try to resume session before sending queued messages
    const savedToken = window._sessionToken || (() => {
      try { return sessionStorage.getItem('infinichess_session'); } catch (e) { return null; }
    })();
    if (savedToken && savedToken.length === 32 && selfId !== -1) {
      console.log('🔄 Attempting session resume...');
      const resumeBuf = new Uint8Array(34);
      const resumeU16 = new Uint16Array(resumeBuf.buffer, 0, 1);
      resumeU16[0] = 55557; // Magic: session resume request
      const tokenBytes = new TextEncoder().encode(savedToken);
      for (let t = 0; t < 32; t++) resumeBuf[2 + t] = tokenBytes[t];
      ws.send(resumeBuf);
      // Don't flush queued messages yet — wait for session response
      return;
    }

    for (let i = 0; i < msgs.length; i++) {
      window.send(msgs[i]);
    }
    msgs.length = 0;
  } catch (error) {
    if (window.errorTracker) {
      window.errorTracker.captureError({
        type: 'websocket_onopen_error',
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      });
    }
    console.error('❌ Error in WebSocket onopen handler:', error);
  }
};

ws.onerror = (error) => {
  try {
    console.error("❌ WebSocket error:", error);
    if (window.errorTracker) {
      window.errorTracker.captureError({
        type: 'websocket_onerror',
        message: error.message || String(error),
        timestamp: new Date().toISOString(),
      });
    }
    if (window.posthog && window.posthog.capture) {
      window.posthog.capture('ws_error', { error: String(error) });
      if (window.posthog.flush) window.posthog.flush();
    }
  } catch (e) {
    console.error('❌ Error in WebSocket onerror handler:', e);
  }
};

ws.onclose = () => {
  try {
    connected = false;
    console.log("Disconnected from server");
    if (window.errorTracker) {
      window.errorTracker.captureMessage('WebSocket disconnected', 'info', {
        reconnect_attempts: reconnectAttempts,
        max_attempts: MAX_RECONNECT_ATTEMPTS,
      });
    }
    if (window.posthog && window.posthog.capture) {
      window.posthog.capture('ws_disconnected', { reconnect_attempts: reconnectAttempts });
      if (window.posthog.flush) window.posthog.flush();
    }
    window.send = (data) => { msgs.push(data); };

    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      const delay = BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts);
      reconnectAttempts++;
      console.log(`🔄 Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
      window.showToast(`Reconnecting... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`, "error", delay);
      setTimeout(() => {
        connectWebSocket();
      }, delay);
    } else {
      window.showToast("Connection lost. Refresh to retry.", "error", 10000);
    }
  } catch (error) {
    if (window.errorTracker) {
      window.errorTracker.captureError({
        type: 'websocket_onclose_error',
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      });
    }
    console.error('❌ Error in WebSocket onclose handler:', error);
  }
};
} // end setupWebSocketHandlers

// Initial connection
connectWebSocket();

// Send camera position periodically for viewport syncing
setInterval(() => {
  if (connected && camera && (window._hadMyPiece || window.spectateMode)) {
    const buf = new Int32Array(4);
    buf[0] = 55552; // Magic number for camera update
    // Send grid coordinates (camera is negative world pixel pos)
    buf[1] = Math.floor(-camera.x / squareSize);
    buf[2] = Math.floor(-camera.y / squareSize);
    buf[3] = Math.floor(camera.scale * 100); // Scale as integer
    send(buf.buffer);
  }
}, 500);

// Player setup modal
let playerSetupCompleted = false;
function initPlayerSetup() {
  console.log("🎮 Initializing player setup modal");

  const nameInput = document.getElementById("playerName");
  const colorOptions = document.querySelectorAll(".color-swatch");
  const startBtn = document.getElementById("startGameBtn");
  const previewCanvas = document.getElementById("previewCanvas");
  const previewName = document.getElementById("previewName");
  const previewCtx = previewCanvas.getContext("2d");

  console.log("🎮 Found color swatches:", colorOptions.length);

  // Restore saved name/color from localStorage
  try {
    const savedName = localStorage.getItem("infinichess_name");
    const savedColor = localStorage.getItem("infinichess_color");
    if (savedName) {
      window.playerName = savedName;
      nameInput.value = savedName;
    }
    if (savedColor) {
      window.playerColor = savedColor;
      colorOptions.forEach((o) => {
        o.classList.toggle("selected", o.dataset.color === savedColor);
      });
    }
  } catch (e) {
    console.warn("Failed to restore player prefs:", e);
  }
  
  // Update preview when images load
  window.onImagesLoaded = updatePreview;

  // Color selection
  colorOptions.forEach((option) => {
    option.addEventListener("click", () => {
      colorOptions.forEach((o) => o.classList.remove("selected"));
      option.classList.add("selected");
      window.playerColor = option.dataset.color;
      updatePreview();
    });
  });

  // Always start as King (evolution system)
  window.playerPiece = 6;

  // Name input
  nameInput.addEventListener("input", () => {
    window.playerName = filterBadWords(nameInput.value.trim().toLowerCase());
    nameInput.value = window.playerName;
    updatePreview();
  });

  // Update preview
  function updatePreview() {
    previewName.textContent = window.playerName || "Your Name";

    // Draw king piece with selected color
    previewCtx.clearRect(0, 0, 150, 150);

    // Background checkerboard (match game board)
    const colors = ["#4F4096", "#3A2E6F"];
    previewCtx.fillStyle = colors[0];
    previewCtx.fillRect(0, 0, 150, 150);

    // Draw the selected piece sprite with tint
    const pieceType = window.playerPiece || 6;
    if (window.imgs && window.imgs[pieceType]) {
      // Draw the sprite
      previewCtx.drawImage(window.imgs[pieceType], 0, 0, 150, 150);
      
      // Tint it with the selected color using multiply blend
      const color = hexToRgb(window.playerColor);
      previewCtx.globalCompositeOperation = "multiply";
      previewCtx.globalAlpha = 0.8;
      previewCtx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
      previewCtx.fillRect(0, 0, 150, 150);
      previewCtx.globalCompositeOperation = "source-over";
      previewCtx.globalAlpha = 1;
    }
  }

  // Start button
  startBtn.addEventListener("click", () => {
    if (!window.playerName) {
      window.playerName = "player" + Math.floor(Math.random() * 9999);
    }
    window.playerName = filterBadWords(window.playerName.toLowerCase());

    // Persist name/color to localStorage
    try {
      localStorage.setItem("infinichess_name", window.playerName);
      localStorage.setItem("infinichess_color", window.playerColor);
    } catch (e) {
      console.warn("Failed to save player prefs:", e);
    }

    console.log("🚀 Start button clicked:", {
      playerName: window.playerName,
      playerColor: window.playerColor,
      connected: connected,
    });

    // PostHog: identify player and track game start
    if (window.posthog) {
      if (window.posthog.identify) window.posthog.identify(window.playerName, { player_color: window.playerColor });
      if (window.posthog.capture) {
        window.posthog.capture('game_start', { player_name: window.playerName, player_color: window.playerColor, is_mobile: /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) });
        if (window.posthog.flush) window.posthog.flush();
      }
    }

    window.spectateMode = false;
    playerSetupCompleted = true;
    document.getElementById("playerSetupDiv").classList.add("hidden");

    // Show in-game UI
    const statsPanel = document.getElementById("stats-panel");
    const statsExpand = document.getElementById("stats-expand");
    if (window.innerWidth <= 768) {
      if (statsExpand) statsExpand.classList.remove("hidden");
    } else {
      if (statsPanel) statsPanel.classList.remove("hidden");
    }

    // Show Steam wishlist button
    const steamOpenBtn = document.getElementById("steam-panel-open");
    if (steamOpenBtn) steamOpenBtn.classList.remove("hidden");

    // Send player info to server
    sendPlayerInfo();
  });

  // Spectate button
  const spectateBtn = document.getElementById("spectateBtn");
  if (spectateBtn) {
    spectateBtn.addEventListener("click", () => {
      console.log("👁️ Spectate mode activated");
      window.spectateMode = true;
      playerSetupCompleted = true;
      document.getElementById("playerSetupDiv").classList.add("hidden");

      // Show in-game UI
      const chatContainer = document.querySelector(".chatContainer");
      if (chatContainer) chatContainer.classList.remove("hidden");
      const statsPanel = document.getElementById("stats-panel");
      const statsExpand = document.getElementById("stats-expand");
      if (window.innerWidth <= 768) {
        if (statsExpand) statsExpand.classList.remove("hidden");
      } else {
        if (statsPanel) statsPanel.classList.remove("hidden");
      }

      // Show Steam wishlist button
      const steamOpenBtnSpec = document.getElementById("steam-panel-open");
      if (steamOpenBtnSpec) steamOpenBtnSpec.classList.remove("hidden");

      // Center camera at origin and request viewport
      camera.x = 0;
      camera.y = 0;
      window._hadMyPiece = true; // Prevent camera auto-centering

      // Send a camera update to get viewport data from server
      // Need to be verified first — send a dummy message to trigger auto-verify
      if (connected) {
        const buf = new Uint8Array(2);
        buf[0] = 0;
        buf[1] = 0;
        ws.send(buf);
      }
    });
  }

  // Initial preview
  updatePreview();
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 255, g: 0, b: 0 };
}

window.sendPlayerInfo = sendPlayerInfo;
function sendPlayerInfo() {
  // Send player info: magic(2) + nameLen(1) + r(1) + g(1) + b(1) + piece(1) + padding(1) + name(variable)
  const nameBuf = new TextEncoder().encode(window.playerName);
  // Ensure even byte length so server can safely create Uint16Array
  const rawLen = 8 + nameBuf.length;
  const bufLen = rawLen % 2 === 0 ? rawLen : rawLen + 1;
  const buf = new Uint8Array(bufLen);
  const u16 = new Uint16Array(buf.buffer);

  u16[0] = 55551; // Magic number for player info (16-bit)
  buf[2] = nameBuf.length;

  const color = hexToRgb(window.playerColor);
  buf[3] = color.r;
  buf[4] = color.g;
  buf[5] = color.b;
  buf[6] = window.playerPiece || 6; // Piece type (1-6)
  buf[7] = 0; // Padding byte to keep alignment

  // Copy name starting at byte 8
  for (let i = 0; i < nameBuf.length; i++) {
    buf[8 + i] = nameBuf[i];
  }

  console.log("📤 Sending player info:", {
    name: window.playerName,
    color: window.playerColor,
    rgb: color,
    bufferLength: buf.length,
    bufferContent: Array.from(buf),
  });

  send(buf); // This uses the message queue if not connected yet

  // After sending player info, send empty buffer to trigger spawn
  setTimeout(() => {
    const spawnBuf = new Uint8Array(0);
    send(spawnBuf);
    console.log("📤 Sent spawn trigger");
  }, 100);
}

// Floating chat bubbles
const MAX_BUBBLES_PER_PLAYER = 3;

function showChatBubble(playerId, text) {
  // Find player's piece near camera viewport
  const camGridX = Math.floor(-camera.x / squareSize);
  const camGridY = Math.floor(-camera.y / squareSize);
  const nearby = spatialHash.queryRadius(camGridX, camGridY, 50);
  let playerPiece = null;

  for (const piece of nearby) {
    if (piece.team === playerId && piece.type !== 0) {
      playerPiece = piece;
      break;
    }
  }

  if (!playerPiece) return;

  // Get or create bubble array for this player
  if (!activeChatBubbles.has(playerId)) {
    activeChatBubbles.set(playerId, []);
  }
  const bubbles = activeChatBubbles.get(playerId);

  // If at max, remove the oldest bubble
  if (bubbles.length >= MAX_BUBBLES_PER_PLAYER) {
    const oldest = bubbles.shift();
    oldest.element.remove();
    clearTimeout(oldest.fadeTimer);
  }

  // Create bubble element with sender name
  const bubble = document.createElement("div");
  bubble.className = "chat-bubble";

  const info = window.playerNamesMap && window.playerNamesMap[playerId];
  const senderName = info ? info.name : "";
  if (senderName) {
    const nameEl = document.createElement("span");
    nameEl.className = "bubble-name";
    nameEl.textContent = senderName + ": ";
    bubble.appendChild(nameEl);
  }
  const msgEl = document.createTextNode(text.substring(0, 32));
  bubble.appendChild(msgEl);
  document.body.appendChild(bubble);

  const bubbleData = {
    text: text,
    time: Date.now(),
    element: bubble,
    pieceX: playerPiece.x,
    pieceY: playerPiece.y,
    playerId: playerId,
    fadeTimer: null,
  };

  bubbles.push(bubbleData);

  // Remove this specific bubble after 5 seconds
  bubbleData.fadeTimer = setTimeout(() => {
    const arr = activeChatBubbles.get(playerId);
    if (!arr) return;
    bubble.classList.add("fading");
    setTimeout(() => {
      bubble.remove();
      const idx = arr.indexOf(bubbleData);
      if (idx !== -1) arr.splice(idx, 1);
      if (arr.length === 0) activeChatBubbles.delete(playerId);
    }, 500);
  }, 5000);
}

// Update bubble positions in render loop
window.updateChatBubbles = function () {
  const BUBBLE_SPACING = 28;

  activeChatBubbles.forEach((bubbles, playerId) => {
    if (!bubbles || bubbles.length === 0) return;

    // Update piece position from spatial hash (search near last known position)
    let pieceX = bubbles[0].pieceX;
    let pieceY = bubbles[0].pieceY;
    const nearby = spatialHash.queryRadius(pieceX, pieceY, 15);
    for (const piece of nearby) {
      if (piece.team === playerId && piece.type !== 0) {
        pieceX = piece.x;
        pieceY = piece.y;
        break;
      }
    }

    // Calculate base screen position above the piece
    const worldX = pieceX * squareSize + squareSize / 2;
    const worldY = pieceY * squareSize - 20;
    const screenX = (worldX + camera.x) * camera.scale + canvas.w / 2;
    const screenY = (worldY + camera.y) * camera.scale + canvas.h / 2;

    const offScreen = screenX < -100 || screenX > canvas.w + 100 ||
      screenY < -100 || screenY > canvas.h + 100;

    // Position each bubble, newest at bottom (index 0 = oldest = highest)
    for (let i = 0; i < bubbles.length; i++) {
      const b = bubbles[i];
      b.pieceX = pieceX;
      b.pieceY = pieceY;

      // Stack from bottom up: newest (last) is closest to piece
      const offsetIndex = bubbles.length - 1 - i;
      b.element.style.left = screenX + "px";
      b.element.style.top = (screenY - offsetIndex * BUBBLE_SPACING) + "px";
      b.element.style.display = offScreen ? "none" : "block";
    }
  });
};


const encoder = new TextEncoder();
function encodeAtPosition(string, u8array, position) {
  return encoder.encodeInto(
    string,
    position ? u8array.subarray(position | 0) : u8array,
  );
}

window.stringHTMLSafe = (str) => {
  return str
    .replace(/&/g, "&amp;")
    .replace(/ /g, "&nbsp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
};

const decoder = new TextDecoder();
function decodeText(u8array, startPos = 0, endPos = Infinity) {
  return decoder.decode(u8array.slice(startPos, endPos));
}

