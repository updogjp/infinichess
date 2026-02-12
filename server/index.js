import uWS from "uWebSockets.js";
import fs from "fs/promises";
import fsSync from "fs";
import "../shared/constants.js";
import badWords from "./badwords.js";

import { networkInterfaces } from "os";

// Simple color name generator (replacing heavy color-2-name library)
const colorNames = [
  "red",
  "blue",
  "green",
  "yellow",
  "purple",
  "orange",
  "pink",
  "cyan",
  "magenta",
  "lime",
  "navy",
  "teal",
  "maroon",
  "olive",
  "aqua",
  "silver",
];
function simpleColorName(num) {
  const index = Math.abs(num) % colorNames.length;
  return colorNames[index] + num.toString().slice(-3);
}

const captchaSecretKey = "[captcha key]";

function serverIp() {
  const nets = networkInterfaces();
  const results = {};

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      const familyV4Value = typeof net.family === "string" ? "IPv4" : 4;
      if (net.family === familyV4Value && !net.internal) {
        if (!results[name]) {
          results[name] = [];
        }
        results[name].push(net.address);
      }
    }
  }

  return results;
}

const isDev = process.env.NODE_ENV === "development" || !process.env.NODE_ENV;
const isProd = !isDev;

// Only log important startup info
if (isDev) {
  console.log("🔧 DEV MODE: CAPTCHA BYPASSED");
}

// Game mode configuration
const GAME_CONFIG = {
  infiniteMode: false, // Set to true for infinite world, false for 64x64 board
};

// Piece spawner configuration
const AI_CONFIG = {
  enabled: true, // Set to false to disable AI players
  piecesPerPlayer: 8, // AI pieces to spawn per online player (e.g., 3 players = 24 AI pieces)
  spawnRadius: 2000, // Spawn AI within this distance of online players
  moveInterval: 3000, // AI makes moves every 3 seconds
  moveChance: 0.3, // 30% chance an AI piece moves each interval
};

// Initialize spatial hash for infinite world
const spatialHash = new SpatialHash();
global.spatialHash = spatialHash;

// Set game mode
global.infiniteMode = GAME_CONFIG.infiniteMode;
console.log(
  `[GAME] Mode: ${GAME_CONFIG.infiniteMode ? "INFINITE" : "64x64 BOARD"}`,
);

// Player metadata store (name, color, etc.)
const playerMetadata = new Map(); // playerId -> {name, color, kingX, kingY}

let leaderboard = new Map();

function sendLeaderboard() {
  const leaderboardData = [];
  // Count in Uint16 slots: 2 for header (magic + onlineCount)
  let u16Len = 2;

  for (const [playerId, kills] of leaderboard) {
    const metadata = playerMetadata.get(playerId);
    const name = metadata ? metadata.name : teamToName(playerId);
    const nameBytes = new TextEncoder().encode(name);

    leaderboardData.push({ id: playerId, kills, name, nameBytes });
    // 3 Uint16 slots for id, kills, nameByteLen + ceil(nameByteLen/2) for name data
    u16Len += 3 + Math.ceil(nameBytes.length / 2);
  }

  const buf = new Uint8Array(u16Len * 2);
  const u16 = new Uint16Array(buf.buffer);
  u16[0] = 48027;
  u16[1] = Object.keys(clients).length; // Online player count

  let i = 2;
  for (const d of leaderboardData) {
    u16[i++] = d.id;
    u16[i++] = d.kills;
    u16[i++] = d.nameBytes.length; // Store byte length, not char length
    // Copy name bytes into buffer at byte offset i*2
    for (let j = 0; j < d.nameBytes.length; j++) {
      buf[i * 2 + j] = d.nameBytes[j];
    }
    i += Math.ceil(d.nameBytes.length / 2);
  }

  return buf;
}

// Seeded RNG for team colors
function teamToColor(team) {
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

function teamToName(team) {
  return simpleColorName(team);
}

// Set square and broadcast to relevant players only
function setSquare(x, y, piece, team) {
  spatialHash.set(x, y, piece, team);

  // Broadcast to players whose viewport contains this square
  const buf = new Uint16Array(5);
  buf[0] = 55555; // Magic number for setSquare
  buf[1] = x;
  buf[2] = y;
  buf[3] = piece;
  buf[4] = team;

  broadcastToViewport(x, y, buf);
}

// Move piece with all game logic
function move(startX, startY, finX, finY, playerId) {
  const startPiece = spatialHash.get(startX, startY);
  const endPiece = spatialHash.get(finX, finY);
  const isCapture = endPiece.type !== 0;

  // Log move in chess notation
  const meta = playerMetadata.get(playerId);
  const playerLabel = meta ? meta.name : `#${playerId}`;
  const notation = moveToNotation(startPiece.type, startX, startY, finX, finY, isCapture);
  if (isCapture) {
    const victimPiece = PIECE_NAMES[endPiece.type] || "piece";
    console.log(`[Move] ${playerLabel}: ${notation} (captures ${victimPiece})`);
  } else {
    console.log(`[Move] ${playerLabel}: ${notation}`);
  }

  // Perform the move
  spatialHash.set(finX, finY, startPiece.type, playerId);
  spatialHash.set(startX, startY, 0, 0);

  // Broadcast move
  const buf = new Uint16Array(6);
  buf[0] = 55554; // Magic number for move
  buf[1] = startX;
  buf[2] = startY;
  buf[3] = finX;
  buf[4] = finY;
  buf[5] = playerId;

  // Broadcast to both source and destination viewports
  broadcastToViewport(startX, startY, buf);
  if (Math.abs(finX - startX) > 1000 || Math.abs(finY - startY) > 1000) {
    broadcastToViewport(finX, finY, buf);
  }

  // Capture logic: captured neutral pieces become yours
  if (endPiece.type !== 0 && endPiece.team === 0) {
    setSquare(startX, startY, endPiece.type, playerId);
  }

  // King capture: eliminate player
  if (
    endPiece.type === 6 &&
    endPiece.team !== 0 &&
    clients[endPiece.team] !== undefined
  ) {
    const victimId = endPiece.team;
    const victimMeta = playerMetadata.get(victimId);
    const victimLabel = victimMeta ? victimMeta.name : `#${victimId}`;
    console.log(`[Kill] ${playerLabel} eliminated ${victimLabel} at ${toChessNotation(finX, finY)}`);

    clients[victimId].dead = true;
    clients[victimId].respawnTime = Date.now() + global.respawnTime - 500;
    teamsToNeutralize.push(victimId);

    // Update leaderboard
    const currentKills = leaderboard.get(playerId) || 0;
    leaderboard.set(playerId, currentKills + 1);
    leaderboard.set(victimId, 0);

    broadcastToAll(sendLeaderboard());
  }
}

// Broadcast to players whose viewport contains a point (x,y in grid coords)
function broadcastToViewport(x, y, message) {
  const VIEWPORT_RADIUS = 50; // grid squares

  for (const client of Object.values(clients)) {
    if (!client.camera || !client.verified) continue;

    // Camera stores grid coords directly
    const dx = x - client.camera.x;
    const dy = y - client.camera.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Scale radius by zoom level
    const effectiveRadius = VIEWPORT_RADIUS / (client.camera.scale || 1);

    if (dist < effectiveRadius) {
      send(client, message);
    }
  }
}

// Broadcast to all connected clients
function broadcastToAll(message) {
  app.publish("global", message, true, false);
}

// Find spawn location with king safety buffer
function findSpawnLocation() {
  const KING_BUFFER = 4; // Kings can't spawn within 4 squares of each other

  // Define spawn boundaries based on game mode
  let minX, maxX, minY, maxY;
  if (GAME_CONFIG.infiniteMode) {
    // Infinite mode: spawn within 50000 units from origin
    const SPAWN_RADIUS = 50000;
    minX = -SPAWN_RADIUS;
    maxX = SPAWN_RADIUS;
    minY = -SPAWN_RADIUS;
    maxY = SPAWN_RADIUS;
  } else {
    // 64x64 mode: spawn within board boundaries
    minX = 0;
    maxX = 63;
    minY = 0;
    maxY = 63;
  }

  for (let tries = 0; tries < 100; tries++) {
    let x, y;
    if (GAME_CONFIG.infiniteMode) {
      const angle = Math.random() * Math.PI * 2;
      const dist = (Math.random() * (maxX - minX)) / 2;
      x = Math.floor(Math.cos(angle) * dist);
      y = Math.floor(Math.sin(angle) * dist);
    } else {
      // Random location within 64x64 board
      x = Math.floor(Math.random() * (maxX - minX + 1) + minX);
      y = Math.floor(Math.random() * (maxY - minY + 1) + minY);
    }

    // Check if empty
    if (spatialHash.has(x, y)) continue;

    // Check for nearby kings
    let tooClose = false;
    const nearbyPieces = spatialHash.queryRect(
      x - KING_BUFFER,
      y - KING_BUFFER,
      x + KING_BUFFER,
      y + KING_BUFFER,
    );

    for (const piece of nearbyPieces) {
      if (piece.type === 6) {
        tooClose = true;
        break;
      }
    }

    if (!tooClose) return { x, y };
  }

  // Fallback: try to find ANY empty spot in 64x64 mode
  if (!GAME_CONFIG.infiniteMode) {
    for (let x = 0; x < 64; x++) {
      for (let y = 0; y < 64; y++) {
        if (!spatialHash.has(x, y)) {
          return { x, y };
        }
      }
    }
  }

  // Fallback: random location (might be occupied, but we'll handle that)
  let x, y;
  if (GAME_CONFIG.infiniteMode) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * 50000;
    x = Math.floor(Math.cos(angle) * dist);
    y = Math.floor(Math.sin(angle) * dist);
  } else {
    x = Math.floor(Math.random() * 64);
    y = Math.floor(Math.random() * 64);
  }
  return { x, y };
}

// Send viewport state to a client
function sendViewportState(ws, centerX, centerY) {
  const VIEWPORT_RADIUS = 30; // Reduced from 50 for faster initial load

  const pieces = spatialHash.queryRect(
    centerX - VIEWPORT_RADIUS,
    centerY - VIEWPORT_RADIUS,
    centerX + VIEWPORT_RADIUS,
    centerY + VIEWPORT_RADIUS,
  );

  // Limit pieces sent to prevent huge messages
  const maxPieces = Math.min(pieces.length, 500);

  // Format: [magic, playerId, count, infiniteMode, x, y, type, team, x, y, type, team...]
  const buf = new Uint16Array(4 + maxPieces * 4);
  buf[0] = 55553; // Magic number for viewport sync
  buf[1] = ws.id;
  buf[2] = maxPieces;
  buf[3] = GAME_CONFIG.infiniteMode ? 1 : 0; // Game mode flag

  let i = 4;
  for (let j = 0; j < maxPieces; j++) {
    const piece = pieces[j];
    buf[i++] = piece.x;
    buf[i++] = piece.y;
    buf[i++] = piece.type;
    buf[i++] = piece.team;
  }

  send(ws, buf);

  if (pieces.length > maxPieces) {
    console.log(
      `[Viewport] Sent ${maxPieces}/${pieces.length} pieces to player ${ws.id}`,
    );
  }
}

const PORT = 3000;
global.clients = {};
let connectedIps = {};
let id = 1;

function generateId() {
  if (id >= 65532) id = 1;
  return id++;
}

const decoder = new TextDecoder();
function decodeText(u8array, startPos = 0, endPos = Infinity) {
  return decoder.decode(u8array.slice(startPos, endPos));
}

// AI player system - spawns intelligent pieces near online players
const aiPieces = new Map(); // aiPieceId -> {x, y, type, lastMove}
let nextAiId = 100000; // AI IDs start at 100000 to avoid collision

// Spawn AI pieces near online players
function spawnAIPieces() {
  if (!AI_CONFIG.enabled) return;

  const players = Object.values(clients);
  if (players.length === 0) return;

  const targetAIPieces = players.length * AI_CONFIG.piecesPerPlayer;
  const currentAIPieces = aiPieces.size;

  // Spawn more AI if below target
  if (currentAIPieces < targetAIPieces) {
    const toSpawn = Math.min(3, targetAIPieces - currentAIPieces);

    for (let i = 0; i < toSpawn; i++) {
      // Pick a random online player to spawn near
      const player = players[Math.floor(Math.random() * players.length)];
      const meta = playerMetadata.get(player.id);
      if (!meta || meta.kingX === undefined) continue;

      // Spawn within radius of player
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * AI_CONFIG.spawnRadius;
      let x = Math.floor(meta.kingX + (Math.cos(angle) * dist) / 150);
      let y = Math.floor(meta.kingY + (Math.sin(angle) * dist) / 150);

      // Clamp to board boundaries in 64x64 mode
      if (!GAME_CONFIG.infiniteMode) {
        x = Math.max(0, Math.min(63, x));
        y = Math.max(0, Math.min(63, y));
      }

      // Check if square is empty
      const existing = spatialHash.get(x, y);
      if (existing.type !== 0) continue;

      // Random piece type (1=pawn, 2=knight, 3=bishop, 4=rook, 5=queen)
      const pieceType = Math.floor(Math.random() * 5) + 1;
      const aiId = nextAiId++;

      // Assign AI piece a color from the palette
      const colorPalette = [
        { r: 255, g: 179, b: 186 }, // #FFB3BA - pink
        { r: 186, g: 255, b: 201 }, // #BAFFC9 - mint
        { r: 186, g: 225, b: 255 }, // #BAE1FF - blue
        { r: 255, g: 255, b: 186 }, // #FFFFBA - yellow
        { r: 255, g: 186, b: 243 }, // #FFBAF3 - magenta
        { r: 186, g: 255, b: 255 }, // #BFFFFF - cyan
        { r: 255, g: 217, b: 186 }, // #FFD9BA - orange
        { r: 231, g: 186, b: 255 }, // #E7BAFF - purple
      ];
      const aiColor = colorPalette[aiId % colorPalette.length];

      // Set piece on board with AI color
      setSquare(x, y, pieceType, aiId);

      // Store AI color metadata
      playerMetadata.set(aiId, {
        name: `AI_${aiId}`,
        color: aiColor,
        pieceType: pieceType,
        kingX: x,
        kingY: y,
      });

      // Track AI piece
      aiPieces.set(aiId, {
        x,
        y,
        type: pieceType,
        lastMove: Date.now(),
      });
    }
  }

  // Remove AI pieces that are too far from all players
  for (const [aiId, aiPiece] of aiPieces) {
    let nearPlayer = false;
    for (const player of players) {
      const meta = playerMetadata.get(player.id);
      if (!meta) continue;

      const dx = (aiPiece.x - meta.kingX) * 150;
      const dy = (aiPiece.y - meta.kingY) * 150;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < AI_CONFIG.spawnRadius * 2) {
        nearPlayer = true;
        break;
      }
    }

    if (!nearPlayer) {
      // Remove AI piece that wandered too far
      setSquare(aiPiece.x, aiPiece.y, 0, 0);
      aiPieces.delete(aiId);
    }
  }
}

// Make AI pieces move intelligently
function moveAIPieces() {
  if (!AI_CONFIG.enabled) return;
  if (aiPieces.size === 0) return;

  for (const [aiId, aiPiece] of aiPieces) {
    // Random chance to move
    if (Math.random() > AI_CONFIG.moveChance) continue;

    // Don't move too frequently
    if (Date.now() - aiPiece.lastMove < AI_CONFIG.moveInterval) continue;

    // Generate legal moves
    const legalMoves = generateLegalMoves(
      aiPiece.x,
      aiPiece.y,
      spatialHash,
      aiId,
    );

    if (legalMoves.length === 0) continue;

    // Pick a random legal move
    const targetMove =
      legalMoves[Math.floor(Math.random() * legalMoves.length)];
    const [newX, newY] = targetMove;

    // Check if target square has a piece
    const targetPiece = spatialHash.get(newX, newY);

    // AI won't capture player kings, only other pieces
    if (targetPiece.type === 6 && clients[targetPiece.team]) {
      continue;
    }

    // If capturing another AI piece, remove it from tracking
    if (targetPiece.team !== 0 && targetPiece.team >= 100000) {
      aiPieces.delete(targetPiece.team);
    }

    // Execute move
    move(aiPiece.x, aiPiece.y, newX, newY, aiId);

    // Update AI piece position
    aiPiece.x = newX;
    aiPiece.y = newY;
    aiPiece.lastMove = Date.now();
  }
}

// Run AI systems if enabled
if (AI_CONFIG.enabled) {
  setInterval(spawnAIPieces, 2000);
  setInterval(moveAIPieces, 1000);
  console.log(
    `[AI] System enabled - ${AI_CONFIG.piecesPerPlayer} pieces per player`,
  );
} else {
  console.log(`[AI] System disabled`);
}

let teamsToNeutralize = [];

// Neutralize disconnected players' pieces
setInterval(() => {
  if (teamsToNeutralize.length === 0) return;

  const teamsToRemove = [...teamsToNeutralize];
  teamsToNeutralize = [];

  // Find and neutralize all pieces belonging to disconnected teams
  const allPieces = spatialHash.getAllPieces();

  for (const piece of allPieces) {
    if (teamsToRemove.includes(piece.team)) {
      if (piece.type === 6) {
        // Remove king entirely
        spatialHash.set(piece.x, piece.y, 0, 0);
        setSquare(piece.x, piece.y, 0, 0);
      } else {
        // Neutralize other pieces
        spatialHash.set(piece.x, piece.y, piece.type, 0);
        setSquare(piece.x, piece.y, piece.type, 0);
      }
    }
  }

  // Broadcast neutralization
  const buf = new Uint16Array(2 + teamsToRemove.length);
  buf[0] = 64535;
  buf[1] = 12345;
  for (let i = 0; i < teamsToRemove.length; i++) {
    buf[i + 2] = teamsToRemove[i];
  }
  broadcastToAll(buf);
}, 440);

// Cleanup captcha keys
let usedCaptchaKeys = {};
setInterval(
  () => {
    const now = Date.now();
    for (const key in usedCaptchaKeys) {
      if (now - usedCaptchaKeys[key] > 2 * 60 * 1000) {
        delete usedCaptchaKeys[key];
      }
    }
  },
  2 * 60 * 1000,
);

// World Persistence - Save/Load
const WORLD_SAVE_PATH = "server/world.dat";
const PLAYER_SAVE_PATH = "server/players.dat";

async function saveWorld() {
  try {
    const pieces = spatialHash.getAllPieces();

    // Filter out player-owned pieces (only save neutral pieces)
    const neutralPieces = pieces.filter((p) => p.team === 0 && p.type !== 0);

    // Format: [count, x, y, type, x, y, type, ...]
    const buf = new Int32Array(1 + neutralPieces.length * 3);
    buf[0] = neutralPieces.length;

    let i = 1;
    for (const piece of neutralPieces) {
      buf[i++] = piece.x;
      buf[i++] = piece.y;
      buf[i++] = piece.type;
    }

    await fs.writeFile(WORLD_SAVE_PATH, Buffer.from(buf.buffer));
  } catch (e) {
    console.error("[Persistence] Failed to save world:", e);
  }
}

async function loadWorld() {
  try {
    if (!fsSync.existsSync(WORLD_SAVE_PATH)) {
      console.log("[Startup] Starting fresh world");
      return;
    }

    const data = await fs.readFile(WORLD_SAVE_PATH);
    const buf = new Int32Array(
      data.buffer,
      data.byteOffset,
      data.byteLength / Int32Array.BYTES_PER_ELEMENT,
    );

    const count = buf[0];

    let i = 1;
    for (let j = 0; j < count; j++) {
      const x = buf[i++];
      const y = buf[i++];
      const type = buf[i++];
      spatialHash.set(x, y, type, 0); // Team 0 = neutral
    }

    console.log(`[Startup] Loaded ${count} pieces`);
  } catch (e) {
    console.error("[Startup] Failed to load world:", e);
  }
}

async function savePlayerMetadata() {
  try {
    const data = [];
    for (const [playerId, meta] of playerMetadata) {
      data.push({
        id: playerId,
        name: meta.name,
        color: meta.color,
        kills: leaderboard.get(playerId) || 0,
      });
    }

    await fs.writeFile(PLAYER_SAVE_PATH, JSON.stringify(data));
  } catch (e) {
    console.error("[Persistence] Failed to save players:", e);
  }
}

async function loadPlayerMetadata() {
  try {
    if (!fsSync.existsSync(PLAYER_SAVE_PATH)) {
      return;
    }

    const fileData = await fs.readFile(PLAYER_SAVE_PATH, "utf8");

    // Handle empty or corrupted file
    if (!fileData || fileData.trim().length === 0) {
      console.log("[Startup] Player data file empty, starting fresh");
      return;
    }

    const data = JSON.parse(fileData);

    for (const record of data) {
      playerMetadata.set(record.id, {
        name: record.name,
        color: record.color,
        kingX: 0,
        kingY: 0,
      });

      if (record.kills > 0) {
        leaderboard.set(record.id, record.kills);
      }
    }

    console.log(`[Startup] Loaded ${data.length} player records`);
  } catch (e) {
    console.error("[Startup] Failed to load players:", e);
  }
}

// Auto-save every 2 minutes (reduce disk I/O)
setInterval(() => {
  saveWorld();
  savePlayerMetadata();
}, 120 * 1000);

// Save on graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n[Shutdown] Saving world...");
  await saveWorld();
  await savePlayerMetadata();
  console.log("[Shutdown] Complete");
  process.exit();
});

process.on("SIGTERM", () => {
  console.log("\n[Shutdown] Saving world...");
  saveWorld();
  savePlayerMetadata();
  process.exit(0);
});

// Load world on startup (async)
console.log("[Startup] Loading world...");
await loadWorld();
await loadPlayerMetadata();

// WebSocket handlers
global.app = uWS
  .App()
  .ws("/*", {
    compression: 0,
    maxPayloadLength: 4096,
    idleTimeout: 0,

    open: (ws) => {
      ws.id = generateId();
      clients[ws.id] = ws;

      ws.verified = false;
      ws.dead = false;
      ws.respawnTime = 0;
      ws.lastMovedTime = 0;
      ws.chatMsgsLast5s = 0;
      ws.lastChat5sTime = 0;
      ws.camera = { x: 0, y: 0, scale: 1 };

      ws.subscribe("global");

      // Don't send initial board state yet - wait for spawn/captcha
      leaderboard.set(ws.id, 0);
      broadcastToAll(sendLeaderboard());
    },

    message: (ws, data) => {
      const u8 = new Uint8Array(data);

      // Camera position update (client sends grid coordinates)
      if (data.byteLength === 12) {
        const decoded = new Int16Array(data);
        if (decoded[0] === 55552) {
          // Client sends grid coords directly
          ws.camera.x = decoded[1];
          ws.camera.y = decoded[2];
          ws.camera.scale = decoded[3] / 100; // Scale stored as integer * 100

          // Send viewport state if needed (throttled)
          const now = Date.now();
          if (!ws.lastViewportSync || now - ws.lastViewportSync > 1000) {
            ws.lastViewportSync = now;
            sendViewportState(ws, ws.camera.x, ws.camera.y);
          }
          return;
        }
      }

      // Player info (name and color and piece type)
      const u16 = new Uint16Array(data);
      if (u16[0] === 55551) {
        const nameLength = u8[2];
        const r = u8[3];
        const g = u8[4];
        const b = u8[5];
        const pieceType = u8[6] || 6; // Default to king if not provided

        let name = decodeText(u8, 8, 8 + nameLength);

        // Sanitize name
        name = name.replace(/[^a-zA-Z0-9_\-\s]/g, "").substring(0, 16);
        if (name.length === 0) name = "Player" + ws.id;

        // Store player metadata
        playerMetadata.set(ws.id, {
          name: name,
          color: { r, g, b },
          pieceType: pieceType,
          kingX: 0,
          kingY: 0,
        });

        // Initialize leaderboard entry if not exists
        if (!leaderboard.has(ws.id)) {
          leaderboard.set(ws.id, 0);
        }

        // Broadcast updated leaderboard with new name
        broadcastToAll(sendLeaderboard());
        return;
      }

      // Unverified players: handle captcha and spawn
      if (
        ws.verified === false ||
        (ws.dead === true && !(u8[0] === 0xf7 && u8[1] === 0xb7))
      ) {
        (async () => {
          if (ws.verified === false) {
            // Player metadata will be set by the client after captcha
            // For now, use default values until player sends their info
            if (!playerMetadata.has(ws.id)) {
              playerMetadata.set(ws.id, {
                name: teamToName(ws.id),
                color: teamToColor(ws.id),
                kingX: 0,
                kingY: 0,
              });
            }

            // Bypass captcha in development mode - but still wait for player setup
            if (isDev) {
              // Don't set verified=true yet, let the spawn logic handle it
              // Just skip captcha verification and continue to spawn check
            } else {
              // Captcha verification (production only)
              const captchaKey = decodeText(u8);
              if (usedCaptchaKeys[captchaKey] !== undefined) {
                if (!ws.closed) ws.close();
                return;
              }

              try {
                const response = await fetch(
                  "https://challenges.cloudflare.com/turnstile/v0/siteverify",
                  {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/x-www-form-urlencoded",
                    },
                    body: `secret=${captchaSecretKey}&response=${captchaKey}`,
                  },
                );

                const result = await response.json();

                if (result.success) {
                  ws.verified = true;
                  usedCaptchaKeys[captchaKey] = Date.now();
                } else {
                  if (!ws.closed) ws.close();
                  return;
                }
              } catch (e) {
                console.error("Captcha verification failed:", e);
                if (!ws.closed) ws.close();
                return;
              }
            }
          }

          if (Date.now() < ws.respawnTime) return;

          // Check if player has set their name (player setup completed)
          let meta = playerMetadata.get(ws.id);
          const defaultName = teamToName(ws.id);

          if (!meta || meta.name === defaultName) {
            return;
          }

          console.log(`[Spawn] Player ${ws.id} (${meta.name}) ready to spawn`);

          // Spawn player's selected piece
          const spawn = findSpawnLocation();
          const pieceType = meta.pieceType || 6; // Default to king if not set
          setSquare(spawn.x, spawn.y, pieceType, ws.id);

          // Update metadata with king position
          meta.kingX = spawn.x;
          meta.kingY = spawn.y;

          ws.verified = true;
          ws.dead = false;

          console.log(
            `[Spawn] ✓ Player ${ws.id} (${meta.name}) spawned at ${toChessNotation(spawn.x, spawn.y)}`,
          );

          // Send initial viewport (spawn coords are grid coords)
          sendViewportState(ws, spawn.x, spawn.y);
          // Store camera as grid coords to match client update format
          ws.camera.x = spawn.x;
          ws.camera.y = spawn.y;

          console.log(`[Spawn] ✓ Sent viewport state to player ${ws.id}`);
        })();
        return;
      }

      if (data.byteLength % 2 !== 0) return;
      const decoded = new Uint16Array(data);

      // Chat message
      if (decoded[0] === 47095) {
        if (data.byteLength > 1000) return;

        const now = Date.now();
        if (now - ws.lastChat5sTime > 10000) {
          ws.chatMsgsLast5s = 0;
          ws.lastChat5sTime = now;
        }

        ws.chatMsgsLast5s++;
        if (ws.chatMsgsLast5s > 3) {
          let chatMessage =
            "[Server] Spam detected. You cannot send messages for up to 10s.";
          if (chatMessage.length % 2 === 1) chatMessage += " ";

          const buf = new Uint8Array(chatMessage.length + 4);
          const u16 = new Uint16Array(buf.buffer);
          buf[0] = 247;
          buf[1] = 183;
          u16[1] = 65534;
          encodeAtPosition(chatMessage, buf, 4);
          send(ws, buf);
          return;
        }

        const txt = decodeText(data, 2);
        if (txt.length > 64) return;

        let chatMessage = txt;
        let id = ws.id;

        if (isBadWord(chatMessage)) return;

        if (chatMessage.slice(0, 7) === "/announce") {
          chatMessage = "[SERVER] " + chatMessage.slice(8);
          id = 65534;
        }

        if (chatMessage.length % 2 === 1) chatMessage += " ";

        const buf = new Uint8Array(chatMessage.length + 4);
        const u16 = new Uint16Array(buf.buffer);
        buf[0] = 247;
        buf[1] = 183;
        u16[1] = id;
        encodeAtPosition(chatMessage, buf, 4);
        broadcastToAll(buf);
      }

      // Move piece
      else if (data.byteLength === 8) {
        const now = Date.now();
        if (now - ws.lastMovedTime < moveCooldown - 500) return;

        const startX = decoded[0];
        const startY = decoded[1];
        const finX = decoded[2];
        const finY = decoded[3];

        const startPiece = spatialHash.get(startX, startY);

        // Validate ownership
        if (startPiece.team !== ws.id) return;

        // Validate move legality
        const legalMoves = generateLegalMoves(
          startX,
          startY,
          spatialHash,
          ws.id,
        );

        let isLegal = false;
        for (const [mx, my] of legalMoves) {
          if (mx === finX && my === finY) {
            isLegal = true;
            break;
          }
        }

        if (!isLegal) return;

        move(startX, startY, finX, finY, ws.id);
        ws.lastMovedTime = now;
      }
    },

    close: (ws) => {
      delete clients[ws.id];
      ws.closed = true;

      if (ws.id) teamsToNeutralize.push(ws.id);

      if (leaderboard.has(ws.id)) {
        leaderboard.delete(ws.id);
        broadcastToAll(sendLeaderboard());
      }

      playerMetadata.delete(ws.id);

      if (ws.ip) delete connectedIps[ws.ip];
    },

    upgrade: (res, req, context) => {
      let ip = getIp(res, req);

      if (ip !== undefined) {
        if (connectedIps[ip] === true) {
          res.end("Connection rejected");
          console.log("ws ratelimit", ip);
          return;
        }
        connectedIps[ip] = true;
      }

      res.upgrade(
        { ip },
        req.getHeader("sec-websocket-key"),
        req.getHeader("sec-websocket-protocol"),
        req.getHeader("sec-websocket-extensions"),
        context,
      );
    },
  })
  .listen(PORT, (token) => {
    if (token) {
      console.log("Server Listening to Port " + PORT);
    } else {
      console.log("Failed to Listen to Port " + PORT);
    }
  });

function getIp(res, req) {
  let forwardedIp =
    req.getHeader("cf-connecting-ip") ||
    req.getHeader("x-forwarded-for") ||
    req.getHeader("x-real-ip");

  if (forwardedIp) {
    return forwardedIp.split(",")[0].trim();
  }

  let rawIp = new TextDecoder().decode(res.getRemoteAddressAsText());

  if (rawIp.startsWith("::ffff:")) {
    return rawIp.substring(7);
  }

  return rawIp;
}

global.send = (ws, msg) => {
  if (!ws.closed) ws.send(msg, true, false);
};

// HTTP handlers
let servedIps = {};
setInterval(() => {
  servedIps = {};
  global.fileServedIps = {};
}, 20 * 1000);

app.get("/", (res, req) => {
  const ip = getIp(res, req);
  if (servedIps[ip] === undefined) servedIps[ip] = 0;

  if (servedIps[ip] > 3 && isProd === true) {
    res.end("ratelimit. Try again in 20 seconds.");
    console.log("main site ratelimit from", ip);
    return;
  }
  servedIps[ip]++;

  // Disable caching in development for hot reloading
  if (!isProd) {
    res.writeHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.writeHeader("Pragma", "no-cache");
    res.writeHeader("Expires", "0");
  }

  res.end(fsSync.readFileSync("client/index.html"));
});

global.fileServedIps = {};

app.get("/:filename/:filename2", (res, req) => {
  const ip = getIp(res, req);
  if (fileServedIps[ip] === undefined) fileServedIps[ip] = 0;
  fileServedIps[ip]++;

  if (fileServedIps[ip] > 25 && isProd === true) {
    res.end("ratelimit. try again in 20 seconds.");
    console.log("file ratelimit", ip);
    return;
  }

  if (req.getParameter(0) === "server") {
    res.cork(() => res.end());
    return;
  }

  let path = req.getParameter(0) + "/" + req.getParameter(1);
  if (fsSync.existsSync(path) && fsSync.statSync(path).isFile()) {
    const pathEnd = path.slice(path.length - 3);
    if (pathEnd === "css") res.writeHeader("Content-Type", "text/css");
    else res.writeHeader("Content-Type", "text/javascript");

    // Disable caching in development for hot reloading
    if (!isProd) {
      res.writeHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.writeHeader("Pragma", "no-cache");
      res.writeHeader("Expires", "0");
    }

    res.end(fsSync.readFileSync(path));
  } else {
    res.cork(() => {
      res.writeStatus("404 Not Found");
      res.end();
    });
  }
});

app.get("/client/assets/:filename", (res, req) => {
  const ip = getIp(res, req);
  if (fileServedIps[ip] === undefined) fileServedIps[ip] = 0;
  fileServedIps[ip]++;

  if (fileServedIps[ip] > 25 && isProd === true) {
    res.end("ratelimit. try again in 20 seconds.");
    console.log("asset file ratelimit", ip);
    return;
  }

  let path = "client/assets/" + req.getParameter(0);
  if (fsSync.existsSync(path) && fsSync.statSync(path).isFile()) {
    const pathEnd = path.slice(path.length - 3);
    if (pathEnd === "png") res.writeHeader("Content-Type", "image/png");
    else res.writeHeader("Content-Type", "audio/mpeg");
    res.end(fsSync.readFileSync(path));
  } else {
    res.cork(() => {
      res.writeStatus("404 Not Found");
      res.end();
    });
  }
});

// Bad word filter
const alphabet = "abcdefghijklmnopqrstuvwxyz";
const alphabetMap = {};
for (let i = 0; i < alphabet.length; i++) {
  alphabetMap[alphabet[i]] = true;
}

function isBadWord(str) {
  let filtered = "";
  for (let i = 0; i < str.length; i++) {
    const char = str[i].toLowerCase();
    if (alphabetMap[char]) filtered += char;
  }

  for (const word of badWords) {
    if (filtered.includes(word)) {
      console.log("bad word", word, filtered);
      return true;
    }
  }
  return false;
}

const encoder = new TextEncoder();
function encodeAtPosition(string, u8array, position) {
  return encoder.encodeInto(
    string,
    position ? u8array.subarray(position | 0) : u8array,
  );
}
