const HOST = location.origin.replace(/^http/, "ws");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

// Spatial hash is now defined in networking.js
// window.spatialHash is available

let mouse,
  lastRenderedMinimap = -1e5;
let selectedSquareX, selectedSquareY;
let legalMoves = [],
  draggingSelected = false,
  moveWasDrag = false;
let curMoveCooldown = 0;

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
        curMoveCooldown <= 0
      ) {
        const buf = new Uint16Array(4);
        buf[0] = selectedSquareX;
        buf[1] = selectedSquareY;
        buf[2] = squareX;
        buf[3] = squareY;
        send(buf);

        legalMoves = [];

        selectedSquareX = squareX;
        selectedSquareY = squareY;

        unconfirmedSX = selectedSquareX;
        unconfirmedSY = selectedSquareY;

        moveWasDrag = false;
        curMoveCooldown = window.moveCooldown || 1500;
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

      legalMoves = generateLegalMoves(
        selectedSquareX,
        selectedSquareY,
        window.spatialHash,
        selfId,
      );

      draggingSelected = true;
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

    if (legal === true && curMoveCooldown <= 0) {
      const buf = new Uint16Array(4);
      buf[0] = selectedSquareX;
      buf[1] = selectedSquareY;
      buf[2] = newX;
      buf[3] = newY;
      send(buf);

      legalMoves = [];
      unconfirmedSX = selectedSquareX;
      unconfirmedSY = selectedSquareY;

      moveWasDrag = true;
      curMoveCooldown = window.moveCooldown || 1500;
      return;
    }
  }
  draggingSelected = false;
};

const colors = ["#4F4096", "#3A2E6F"]; // Purple theme
const squareSize = 150;

// Camera starts at origin
let camera = { x: 0, y: 0, scale: 1 };
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
for (let i = 0; i < srcs.length; i++) {
  imgsToLoad++;
  const img = new Image();
  img.src = `/client/assets/${srcs[i]}.png`;
  img.onload = () => {
    imgsToLoad--;
    console.log(`🖼️ Loaded image: ${srcs[i]}.png (${6 - imgsToLoad}/6)`);
    if (imgsToLoad === 0) {
      imgsLoaded = true;
      console.log("✅ All images loaded, starting render loop");
      requestAnimationFrame(render);
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
let cooldown = -1;
let mousePos;
let gameOver = false,
  interpSquare = undefined,
  gameOverAlpha = 0,
  gameOverTime;

let minimapCanvas = document.getElementById("minimapCanvas");
let cx = minimapCanvas.getContext("2d");

// Track first render for initial camera setup
let firstRenderDone = false;

function render() {
  canvas.w = canvas.width;
  canvas.h = canvas.height;
  ctx.imageSmoothingEnabled = camera.scale < 2;

  requestAnimationFrame(render);

  time = performance.now();
  dt = time - lastTime;
  if (cooldown > 0) changed = true;
  cooldown -= dt;
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
      camera.scale *= 1.02;
      if (camera.scale > 6) camera.scale = 6;
      moved = true;
    }
    if (window.input.zoomOut) {
      camera.scale *= 0.98;
      if (camera.scale < 0.27) camera.scale = 0.27;
      moved = true;
    }
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

  if (!changed && !interpSquare) return;
  changed = false;

  // Clear background
  ctx.fillStyle = "#121212";
  ctx.fillRect(0, 0, canvas.w, canvas.h);

  const t = ctx.getTransform();

  ctx.translate(canvas.w / 2, canvas.h / 2);
  ctx.scale(camera.scale, camera.scale);
  ctx.translate(camera.x, camera.y);

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

  // Render legal moves
  if (legalMoves) {
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "black";
    for (let i = 0; i < legalMoves.length; i++) {
      const [mx, my] = legalMoves[i];
      if (mx < startX || mx > endX || my < startY || my > endY) continue;

      const x = mx * squareSize + squareSize / 2;
      const y = my * squareSize + squareSize / 2;

      ctx.beginPath();
      ctx.arc(x, y, squareSize / 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.closePath();
    }
    ctx.globalAlpha = 1;
  }

  // Render pieces from spatial hash
  if (window.spatialHash) {
    const visiblePieces = window.spatialHash.queryRect(
      startX,
      startY,
      endX,
      endY,
    );

    for (const piece of visiblePieces) {
      if (piece.type === 0) continue;

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

        ctx.drawImage(
          imgs[piece.type],
          piece.x * squareSize,
          piece.y * squareSize,
        );
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
        const hash = `${color.r}_${color.g}_${color.b}`;

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
          interp[0] = interpolate(interp[0], piece.x, (0.45 * dt) / 16.66);
          interp[1] = interpolate(interp[1], piece.y, (0.45 * dt) / 16.66);

          if (
            Math.abs(interp[0] - piece.x) < 0.01 &&
            Math.abs(interp[1] - piece.y) < 0.01
          ) {
            delete interpolatingPieces[interpKey];
          }

          renderX = interp[0];
          renderY = interp[1];
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

        ctx.drawImage(
          tintedArr[piece.type],
          renderX * squareSize,
          renderY * squareSize,
        );
        ctx.restore();
      }
    }
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

    // Move cooldown indicator above player's king
    if (curMoveCooldown > 0) {
      curMoveCooldown -= dt;
      const percent = Math.max(0, curMoveCooldown / window.moveCooldown);

      // Find player's king
      const pieces = window.spatialHash.getAllPieces();
      let kingPiece = null;
      for (const piece of pieces) {
        if (piece.type === 6 && piece.team === selfId) {
          kingPiece = piece;
          break;
        }
      }

      if (kingPiece) {
        const w = squareSize * 0.8;
        const h = 8;
        const x = kingPiece.x * squareSize + (squareSize - w) / 2;
        const y = kingPiece.y * squareSize - 15;

        // Background (gray - empty part)
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.fillRect(x + w * (1 - percent), y, w * percent, h);

        // Foreground (colored - filled part)
        const color = teamToColor(selfId);
        ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.9)`;
        ctx.fillRect(x, y, w * (1 - percent), h);

        // Border
        ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, h);
      }
    }
  }

  ctx.setTransform(t);

  // Minimap (simplified for infinite world)
  renderMinimap();

  // Game over screen
  if (gameOver === true) {
    gameOverAlpha = interpolate(gameOverAlpha, 1, (dt / 16.66) * 0.1);
    changed = true;

    const y = (Math.sin(time / 320) * canvas.h) / 16;

    ctx.font = "700 62px monospace";
    ctx.lineWidth = 5;
    ctx.fillStyle = "white";
    ctx.strokeStyle = "black";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeText("Game Over!", canvas.w / 2, canvas.h / 2 + y - 36);
    ctx.fillText("Game Over!", canvas.w / 2, canvas.h / 2 + y - 36);

    ctx.font = "700 31px monospace";
    ctx.lineWidth = 3;

    const t = (Math.max(0, gameOverTime + respawnTime - time) / 1000).toFixed(
      1,
    );

    ctx.strokeText(`You Will Respawn in`, canvas.w / 2, canvas.h / 2 + y + 7);
    ctx.fillText(`You Will Respawn in`, canvas.w / 2, canvas.h / 2 + y + 7);

    ctx.strokeText(`${t} seconds.`, canvas.w / 2, canvas.h / 2 + y + 36);
    ctx.fillText(`${t} seconds.`, canvas.w / 2, canvas.h / 2 + y + 36);
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

    // Find player's king position
    if (window.spatialHash) {
      const pieces = window.spatialHash.getAllPieces();
      let kingX = null;
      let kingY = null;
      let myPieceCount = 0;

      for (const piece of pieces) {
        if (piece.team === selfId) {
          myPieceCount++;
          if (piece.type === 6) {
            kingX = piece.x;
            kingY = piece.y;
          }
        }
      }

      if (kingX !== null && kingY !== null) {
        document.getElementById("stat-pos").textContent = `${kingX},${kingY}`;
      } else {
        document.getElementById("stat-pos").textContent = "NOT FOUND";
      }

      document.getElementById("stat-pieces").textContent = myPieceCount;
    }

    document.getElementById("stat-zoom").textContent =
      camera.scale.toFixed(2) + "x";
  }
}

function renderMinimap() {
  // Minimap disabled for now
  return;

  const offset = Math.min(canvas.w, canvas.h) / 20;
  const size = Math.min(canvas.w, canvas.h) / 5;

  const x = canvas.w - offset - size;
  const y = canvas.h - offset - size;

  ctx.strokeStyle = "black";
  ctx.fillStyle = "black";
  ctx.lineWidth = 3;

  ctx.lineJoin = ctx.lineCap = "round";
  ctx.beginPath();
  ctx.rect(x, y, size, size);

  ctx.globalAlpha = 0.3;
  ctx.fill();
  ctx.closePath();
  ctx.globalAlpha = 1;

  // Update minimap periodically
  if (time - lastRenderedMinimap > 300 && window.spatialHash) {
    lastRenderedMinimap = time;

    minimapCanvas.width = size;
    minimapCanvas.height = size;

    minimapCanvas.style.width = size + "px";
    minimapCanvas.style.height = size + "px";

    minimapCanvas.style.bottom = offset + "px";
    minimapCanvas.style.right = offset + "px";

    // Clear minimap
    cx.clearRect(0, 0, size, size);

    if (window.infiniteMode) {
      // For infinite world, show nearby pieces relative to camera
      const VIEW_DIST = 100; // squares
      const nearbyPieces = window.spatialHash.queryRect(
        camera.x / squareSize - VIEW_DIST,
        camera.y / squareSize - VIEW_DIST,
        camera.x / squareSize + VIEW_DIST,
        camera.y / squareSize + VIEW_DIST,
      );

      const scale = size / (VIEW_DIST * 2);

      for (const piece of nearbyPieces) {
        if (piece.type === 0 || piece.team === 0) continue;

        const relX = (piece.x - camera.x / squareSize + VIEW_DIST) * scale;
        const relY = (piece.y - camera.y / squareSize + VIEW_DIST) * scale;

        if (relX >= 0 && relX < size && relY >= 0 && relY < size) {
          let color = teamToColor(piece.team);
          cx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
          cx.fillRect(relX, relY, Math.max(2, scale), Math.max(2, scale));
        }
      }

      // Draw player position (center of minimap)
      cx.fillStyle = "white";
      cx.fillRect(size / 2 - 2, size / 2 - 2, 4, 4);
    } else {
      // For 64x64 board, show entire board
      const allPieces = window.spatialHash.queryRect(0, 0, 63, 63);
      const scale = size / 64;

      for (const piece of allPieces) {
        if (piece.type === 0 || piece.team === 0) continue;

        const relX = piece.x * scale;
        const relY = piece.y * scale;

        let color = teamToColor(piece.team);
        cx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
        cx.fillRect(relX, relY, Math.max(2, scale), Math.max(2, scale));
      }

      // Draw player position on 64x64 board
      if (window.spatialHash) {
        const pieces = window.spatialHash.getAllPieces();
        for (const piece of pieces) {
          if (piece.type === 6 && piece.team === selfId) {
            cx.fillStyle = "white";
            const pX = piece.x * scale;
            const pY = piece.y * scale;
            cx.fillRect(
              pX,
              pY,
              Math.max(3, scale * 1.5),
              Math.max(3, scale * 1.5),
            );
            break;
          }
        }
      }
    }
  }
}

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

  // Generate random color for other teams
  let num = Math.round(((Math.sin(team * 10000) + 1) / 2) * 0xffffff);

  let r = (num & 0xff0000) >>> 16;
  let g = (num & 0x00ff00) >>> 8;
  let b = num & 0x0000ff;

  if (r + g + b > 520) {
    r /= 2;
    g /= 2;
    b /= 2;
  }

  return { r, g, b };
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

  tintedImgs.set(`${color.r}_${color.g}_${color.b}`, arr);
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

// MOBILE - Removed (desktop only)

function interpolate(s, e, t) {
  return (1 - t) * s + e * t;
}
