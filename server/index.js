import uWS from "uWebSockets.js";
import fs from "fs/promises";
import fsSync from "fs";
import pathModule from "path";
import "../shared/constants.js";
import { Filter } from "bad-words";

const profanityFilter = new Filter();


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

const isDev = process.env.NODE_ENV === "development" || !process.env.NODE_ENV;
const isProd = !isDev;

// Only log important startup info
if (isDev) {
  console.log("🔧 DEV MODE: CAPTCHA BYPASSED");
}

// Game mode configuration
const GAME_CONFIG = {
  infiniteMode: true, // Set to true for infinite world, false for 64x64 board
};

// Piece spawner configuration
const AI_CONFIG = {
  enabled: true, // Set to false to disable AI players
  verboseLog: false, // Set to true to log every AI move to console
  baseCount: 12, // AI pieces when 0 players online (ambient life)
  soloBonus: 8, // Extra AI for a single player (so they have targets)
  piecesPerPlayer: 2, // Additional AI per player beyond the first
  maxAI: 60, // Hard cap on total AI pieces
  spawnRadius: 25, // Spawn AI within this many grid squares of a player
  engagementRadius: 15, // Preferred spawn distance — close enough to see and fight
  removalRadius: 60, // Remove AI if farther than this from ALL players (grid squares)
  moveInterval: 800, // AI makes moves every 800ms
  moveChance: 0.3, // 30% chance an AI piece moves each interval
  playerSpawnRadius: 30, // New players spawn within this radius of the cluster center
};

// Chess-themed AI name generator
const AI_NAME_PREFIXES = [
  "Grand", "Dark", "Silent", "Swift", "Iron", "Shadow", "Royal", "Brave",
  "Noble", "Crimson", "Frost", "Storm", "Ancient", "Phantom", "Golden",
  "Rogue", "Steel", "Ivory", "Obsidian", "Emerald",
];
const AI_NAME_SUFFIXES = [
  "Gambit", "Castle", "Tempo", "Blitz", "Zugzwang", "Fianchetto", "Fork",
  "Pin", "Skewer", "Mate", "Check", "Endgame", "Opening", "Sacrifice",
  "Promotion", "Stalemate", "Elo", "Rank", "File", "Diagonal",
];
function generateAIName(aiId) {
  const prefix = AI_NAME_PREFIXES[aiId % AI_NAME_PREFIXES.length];
  const suffix = AI_NAME_SUFFIXES[Math.floor(aiId / AI_NAME_PREFIXES.length) % AI_NAME_SUFFIXES.length];
  return `${prefix}${suffix}`;
}

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

// Spawn immunity tracking: playerId -> expiry timestamp
const spawnImmunity = new Map();

let teamsToNeutralize = [];

// Session reconnection system — allows players to resume after brief disconnects
const SESSION_TTL = 30 * 1000; // 30 seconds to reconnect
const sessions = new Map(); // token -> { id, name, color, kills, kingX, kingY, pieceType, expiry, neutralizeTimer }

function generateSessionToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) token += chars[Math.floor(Math.random() * chars.length)];
  return token;
}

// Clean up expired sessions periodically
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (now > session.expiry) {
      // Session expired — neutralize their pieces now
      teamsToNeutralize.push(session.id);
      leaderboard.delete(session.id);
      playerMetadata.delete(session.id);
      cleanupPawnBots(session.id);
      sessions.delete(token);
      console.log(`[Session] Expired: ${session.name} (#${session.id})`);
    }
  }
}, 5000);

let leaderboard = new Map();
let leaderboardDirty = false; // Debounce flag for leaderboard broadcasts (P3)

// Persistent all-time top 3 leaderboard (gold/silver/bronze)
const TOP3_SAVE_PATH = "server/top3.json";
let allTimeTop3 = []; // [{name, kills, color}]

function loadTop3() {
  try {
    if (fsSync.existsSync(TOP3_SAVE_PATH)) {
      const data = fsSync.readFileSync(TOP3_SAVE_PATH, "utf8");
      if (data && data.trim().length > 0) {
        allTimeTop3 = JSON.parse(data);
        console.log(`[Startup] Loaded ${allTimeTop3.length} all-time top entries`);
      }
    }
  } catch (e) {
    console.error("[Startup] Failed to load top 3:", e);
    allTimeTop3 = [];
  }
}

function saveTop3() {
  try {
    // Write-then-rename to prevent corruption on crash (E2)
    const tmpPath = TOP3_SAVE_PATH + ".tmp";
    fsSync.writeFileSync(tmpPath, JSON.stringify(allTimeTop3));
    fsSync.renameSync(tmpPath, TOP3_SAVE_PATH);
  } catch (e) {
    console.error("[Persistence] Failed to save top 3:", e);
  }
}

function checkTop3(name, kills, color) {
  if (kills <= 0) return false;

  // Check if this score qualifies for top 3
  const dominated = allTimeTop3.length < 3 || kills > allTimeTop3[allTimeTop3.length - 1].kills;
  if (!dominated) return false;

  // Check if this player already has an entry — update if higher
  const existing = allTimeTop3.findIndex(e => e.name === name);
  if (existing !== -1) {
    if (kills <= allTimeTop3[existing].kills) return false;
    allTimeTop3[existing].kills = kills;
    allTimeTop3[existing].color = color;
  } else {
    allTimeTop3.push({ name, kills, color });
  }

  // Sort and trim to top 3
  allTimeTop3.sort((a, b) => b.kills - a.kills);
  allTimeTop3 = allTimeTop3.slice(0, 3);

  saveTop3();
  broadcastToAll(sendTop3());
  return true;
}

function sendTop3() {
  // Magic number 48028 for top 3 leaderboard
  // Format: [magic, count, ...entries] where each entry is:
  // [kills(u16), nameLen(u16), ...nameBytes]
  // Plus 3 bytes for color (r,g,b) packed after name
  let totalU16 = 2; // magic + count
  const entries = [];

  for (const entry of allTimeTop3) {
    const nameBytes = new TextEncoder().encode(entry.name);
    entries.push({ ...entry, nameBytes });
    // kills(1) + nameLen(1) + ceil(nameBytes/2) + colorSlots(2 = 4 bytes for r,g,b + pad)
    totalU16 += 1 + 1 + Math.ceil(nameBytes.length / 2) + 2;
  }

  const buf = new Uint8Array(totalU16 * 2);
  const u16 = new Uint16Array(buf.buffer);
  u16[0] = 48028; // Magic for top 3
  u16[1] = entries.length;

  let i = 2;
  for (const e of entries) {
    u16[i++] = e.kills;
    u16[i++] = e.nameBytes.length;
    for (let j = 0; j < e.nameBytes.length; j++) {
      buf[i * 2 + j] = e.nameBytes[j];
    }
    i += Math.ceil(e.nameBytes.length / 2);
    // Pack color as 4 bytes (r, g, b, 0)
    const c = e.color || { r: 255, g: 255, b: 255 };
    buf[i * 2] = c.r;
    buf[i * 2 + 1] = c.g;
    buf[i * 2 + 2] = c.b;
    buf[i * 2 + 3] = 0;
    i += 2;
  }

  return buf;
}

function sendLeaderboard() {
  // Sort by kills descending, limit to top 20
  const sorted = [...leaderboard.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  const leaderboardData = [];
  // Count in Uint16 slots: 2 for header (magic + onlineCount)
  let u16Len = 2;

  for (const [playerId, kills] of sorted) {
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
  // Int32Array supports negative coords for infinite mode
  const buf = new Int32Array(5);
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

  // Get player label for logging
  const meta = playerMetadata.get(playerId);
  const playerLabel = meta ? meta.name : `#${playerId}`;

  // Log move in chess notation (only if verbose logging enabled)
  if (AI_CONFIG.verboseLog) {
    const notation = moveToNotation(startPiece.type, startX, startY, finX, finY, isCapture);
    if (isCapture) {
      const victimPiece = PIECE_NAMES[endPiece.type] || "piece";
      console.log(`[Move] ${playerLabel}: ${notation} (captures ${victimPiece})`);
    } else {
      console.log(`[Move] ${playerLabel}: ${notation}`);
    }
  }

  // Perform the move
  spatialHash.set(finX, finY, startPiece.type, playerId);
  spatialHash.set(startX, startY, 0, 0);

  // Broadcast move (Int32Array for infinite mode negative coords)
  const buf = new Int32Array(6);
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

  // Handle captures — increment kills, evolve, update leaderboard
  if (isCapture && endPiece.team !== playerId) {
    // Player piece capture: eliminate the victim player
    if (endPiece.team > 0 && endPiece.team < AI_ID_MIN && clients[endPiece.team] !== undefined) {
      const victimId = endPiece.team;
      const victimMeta = playerMetadata.get(victimId);
      const victimLabel = victimMeta ? victimMeta.name : `#${victimId}`;
      console.log(`[Kill] ${playerLabel} eliminated ${victimLabel} at ${toChessNotation(finX, finY)}`);

      clients[victimId].dead = true;
      clients[victimId].respawnTime = Date.now() + global.respawnTime;
      teamsToNeutralize.push(victimId);
      leaderboard.set(victimId, 0);
      cleanupPawnBots(victimId);
    }

    // Increment kills for any non-neutral capture (AI or player victim)
    if (endPiece.team !== 0) {
      const currentKills = leaderboard.get(playerId) || 0;
      leaderboard.set(playerId, currentKills + 1);
      leaderboardDirty = true;

      // Check all-time top 3
      const killerMeta = playerMetadata.get(playerId);
      if (killerMeta) checkTop3(killerMeta.name, currentKills + 1, killerMeta.color);

      // Auto-evolve: check if piece should transform
      checkEvolution(playerId, finX, finY, currentKills + 1);
    }
  }
}

// Check if a player should evolve after a capture
function checkEvolution(playerId, pieceX, pieceY, newKills) {
  const currentPiece = spatialHash.get(pieceX, pieceY);
  if (currentPiece.team !== playerId) return;

  const newPieceType = getEvolutionPiece(newKills, playerId);
  if (newPieceType !== currentPiece.type) {
    const meta = playerMetadata.get(playerId);
    const playerLabel = meta ? meta.name : `#${playerId}`;
    console.log(`[Evolve] ${playerLabel} evolved to ${PIECE_NAMES[newPieceType]} at ${newKills} kills`);

    // Transform the piece on the board
    setSquare(pieceX, pieceY, newPieceType, playerId);

    // Update metadata
    if (meta) {
      meta.kingX = pieceX;
      meta.kingY = pieceY;
    }
  }
}

// Broadcast to players whose viewport contains a point (x,y in grid coords)
function broadcastToViewport(x, y, message) {
  const VIEWPORT_RADIUS = 50; // grid squares

  for (const client of Object.values(clients)) {
    if (!client.camera || !client.verified) continue;

    const dx = x - client.camera.x;
    const dy = y - client.camera.y;
    const distSq = dx * dx + dy * dy;

    // Scale radius by zoom level, compare squared to avoid sqrt
    const effectiveRadius = VIEWPORT_RADIUS / (client.camera.scale || 1);

    if (distSq < effectiveRadius * effectiveRadius) {
      send(client, message);
    }
  }
}

// Broadcast to all connected clients
function broadcastToAll(message) {
  app.publish("global", message, true, false);
}

// Get the cluster center — average position of all spawned players, or origin if none
function getClusterCenter() {
  const players = Object.values(clients);
  let sumX = 0, sumY = 0, count = 0;
  for (const p of players) {
    const m = playerMetadata.get(p.id);
    if (m && (m.kingX !== 0 || m.kingY !== 0)) {
      sumX += m.kingX;
      sumY += m.kingY;
      count++;
    }
  }
  if (count === 0) return { x: 0, y: 0 };
  return { x: Math.floor(sumX / count), y: Math.floor(sumY / count) };
}

// Find spawn location with king safety buffer and legal move check
// Players spawn near the cluster center so they always have targets
function findSpawnLocation(pieceType = 6) {
  const KING_BUFFER = 4; // Kings can't spawn within 4 squares of each other

  if (!GAME_CONFIG.infiniteMode) {
    // 64x64 mode: simple random placement
    for (let tries = 0; tries < 200; tries++) {
      const x = Math.floor(Math.random() * 64);
      const y = Math.floor(Math.random() * 64);
      if (spatialHash.has(x, y)) continue;

      let tooClose = false;
      const nearby = spatialHash.queryRect(x - KING_BUFFER, y - KING_BUFFER, x + KING_BUFFER, y + KING_BUFFER);
      for (const piece of nearby) {
        if (piece.type === 6 || (piece.team > 0 && piece.team < AI_ID_MIN)) { tooClose = true; break; }
      }
      if (tooClose) continue;

      spatialHash.set(x, y, pieceType, 99999);
      const moves = generateLegalMoves(x, y, spatialHash, 99999, 0);
      spatialHash.set(x, y, 0, 0);
      if (moves.length === 0) continue;
      return { x, y };
    }
    // Fallback: keep trying random positions, skip occupied tiles
    for (let f = 0; f < 50; f++) {
      const fx = Math.floor(Math.random() * 64);
      const fy = Math.floor(Math.random() * 64);
      if (!spatialHash.has(fx, fy)) return { x: fx, y: fy };
    }
    return { x: Math.floor(Math.random() * 64), y: Math.floor(Math.random() * 64) };
  }

  // Infinite mode: spawn near the cluster center
  const center = getClusterCenter();
  const radius = AI_CONFIG.playerSpawnRadius;

  for (let tries = 0; tries < 200; tries++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * radius;
    const x = Math.floor(center.x + Math.cos(angle) * dist);
    const y = Math.floor(center.y + Math.sin(angle) * dist);

    if (spatialHash.has(x, y)) continue;

    let tooClose = false;
    const nearby = spatialHash.queryRect(x - KING_BUFFER, y - KING_BUFFER, x + KING_BUFFER, y + KING_BUFFER);
    for (const piece of nearby) {
      if (piece.type === 6 || (piece.team > 0 && piece.team < AI_ID_MIN)) { tooClose = true; break; }
    }
    if (tooClose) continue;

    spatialHash.set(x, y, pieceType, 99999);
    const moves = generateLegalMoves(x, y, spatialHash, 99999, 0);
    spatialHash.set(x, y, 0, 0);
    if (moves.length === 0) continue;
    return { x, y };
  }

  // Fallback: slightly larger radius, skip occupied tiles
  for (let f = 0; f < 50; f++) {
    const fAngle = Math.random() * Math.PI * 2;
    const fDist = Math.random() * radius * 2;
    const fx = Math.floor(center.x + Math.cos(fAngle) * fDist);
    const fy = Math.floor(center.y + Math.sin(fAngle) * fDist);
    if (!spatialHash.has(fx, fy)) return { x: fx, y: fy };
  }
  const fAngle = Math.random() * Math.PI * 2;
  const fDist = Math.random() * radius * 2;
  return { x: Math.floor(center.x + Math.cos(fAngle) * fDist), y: Math.floor(center.y + Math.sin(fAngle) * fDist) };
}

// Send viewport state to a client
function sendViewportState(ws, centerX, centerY) {
  const VIEWPORT_RADIUS = 50; // Match broadcastToViewport radius

  const pieces = spatialHash.queryRect(
    centerX - VIEWPORT_RADIUS,
    centerY - VIEWPORT_RADIUS,
    centerX + VIEWPORT_RADIUS,
    centerY + VIEWPORT_RADIUS,
  );

  // Limit pieces sent to prevent huge messages
  const maxPieces = Math.min(pieces.length, 500);
  console.log(`[Viewport] Querying ${centerX},${centerY} ±${VIEWPORT_RADIUS}: found ${pieces.length} pieces, sending ${maxPieces}`);

  // Format: [magic, playerId, count, infiniteMode, x, y, type, team, x, y, type, team...]
  // Int32Array supports negative coords for infinite mode
  const buf = new Int32Array(4 + maxPieces * 4);
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

const PORT = parseInt(process.env.PORT) || 3000;
global.clients = {};
let connectedIps = {};
let id = 1;

// AI IDs use range 10000-60000, Player IDs use 1-9999
// Coordinate messages use Int32Array; non-coord messages (leaderboard, immunity) still use Uint16
const AI_ID_MIN = 10000;
const AI_ID_MAX = 60000;

// Shared pastel palette for AI pieces (hoisted from spawnAIPieces)
const AI_COLOR_PALETTE = [
  { r: 255, g: 179, b: 186 }, // #FFB3BA - pink
  { r: 186, g: 255, b: 201 }, // #BAFFC9 - mint
  { r: 186, g: 225, b: 255 }, // #BAE1FF - blue
  { r: 255, g: 255, b: 186 }, // #FFFFBA - yellow
  { r: 255, g: 186, b: 243 }, // #FFBAF3 - magenta
  { r: 186, g: 255, b: 255 }, // #BFFFFF - cyan
  { r: 255, g: 217, b: 186 }, // #FFD9BA - orange
  { r: 231, g: 186, b: 255 }, // #E7BAFF - purple
];

function generateId() {
  if (id >= AI_ID_MIN) id = 1;
  return id++;
}

const decoder = new TextDecoder();
function decodeText(u8array, startPos = 0, endPos = Infinity) {
  return decoder.decode(u8array.slice(startPos, endPos));
}

// AI player system - spawns intelligent pieces near online players
const aiPieces = new Map(); // aiPieceId -> {x, y, type, lastMove}
let nextAiId = AI_ID_MIN;

// Pawn bot system — 2 pawn escorts spawned near each live player
// pawnBots: Map of pawnBotId -> { x, y, ownerId, lastMove }
// playerPawnBots: Map of playerId -> Set<pawnBotId>
const pawnBots = new Map();
const playerPawnBots = new Map(); // playerId -> Set of pawnBotId
const PAWN_BOT_ID_MIN = 60000; // Above regular AI range
const PAWN_BOT_ID_MAX = 65000;
let nextPawnBotId = PAWN_BOT_ID_MIN;
const PAWN_BOTS_PER_PLAYER = 2;
const PAWN_BOT_SPAWN_RADIUS = 5; // Spawn within 5 squares of player
const PAWN_BOT_MOVE_INTERVAL = 1200; // Move every 1.2s

// Calculate target AI count based on player count (inversely scaled)
function getTargetAICount(playerCount) {
  if (playerCount === 0) return AI_CONFIG.baseCount;
  if (playerCount === 1) return AI_CONFIG.baseCount + AI_CONFIG.soloBonus;
  // More players = less AI per player, but always some ambient AI
  // Formula: base + soloBonus tapers off, plus small per-player bonus
  const scaledBonus = Math.floor(AI_CONFIG.soloBonus / Math.sqrt(playerCount));
  const perPlayer = AI_CONFIG.piecesPerPlayer * playerCount;
  return Math.min(AI_CONFIG.maxAI, AI_CONFIG.baseCount + scaledBonus + perPlayer);
}

// Spawn AI pieces near online players
function spawnAIPieces() {
  if (!AI_CONFIG.enabled) return;

  const players = Object.values(clients);
  const spawnedPlayers = players.filter(p => {
    const m = playerMetadata.get(p.id);
    return m && m.kingX !== undefined && (m.kingX !== 0 || m.kingY !== 0);
  });

  const targetAIPieces = getTargetAICount(spawnedPlayers.length);

  // Spawn more AI if below target
  if (aiPieces.size < targetAIPieces) {
    const toSpawn = Math.min(5, targetAIPieces - aiPieces.size);

    for (let i = 0; i < toSpawn; i++) {
      let centerX = 0;
      let centerY = 0;

      if (spawnedPlayers.length > 0) {
        // Pick a random player to spawn near — weighted toward players with fewer nearby AI
        const player = spawnedPlayers[Math.floor(Math.random() * spawnedPlayers.length)];
        const meta = playerMetadata.get(player.id);
        centerX = meta.kingX;
        centerY = meta.kingY;
      } else {
        // No players: spawn near cluster center (origin initially)
        const center = getClusterCenter();
        centerX = center.x;
        centerY = center.y;
      }

      // Spawn within engagement radius (close enough to see and fight)
      // 70% chance: tight engagement radius, 30% chance: wider patrol radius
      const tight = Math.random() < 0.7;
      const radius = tight ? AI_CONFIG.engagementRadius : AI_CONFIG.spawnRadius;
      const angle = Math.random() * Math.PI * 2;
      const dist = (Math.random() * 0.7 + 0.3) * radius; // Avoid spawning right on top
      let x = Math.floor(centerX + Math.cos(angle) * dist);
      let y = Math.floor(centerY + Math.sin(angle) * dist);

      if (!GAME_CONFIG.infiniteMode) {
        x = Math.max(0, Math.min(63, x));
        y = Math.max(0, Math.min(63, y));
      }

      const existing = spatialHash.get(x, y);
      if (existing.type !== 0) continue;

      const pieceType = globalThis.PIECE_KING;
      if (nextAiId >= AI_ID_MAX) nextAiId = AI_ID_MIN;
      const aiId = nextAiId++;

      const aiColor = AI_COLOR_PALETTE[aiId % AI_COLOR_PALETTE.length];

      setSquare(x, y, pieceType, aiId);

      const aiName = generateAIName(aiId);
      playerMetadata.set(aiId, {
        name: aiName,
        color: aiColor,
        kingX: x,
        kingY: y,
      });

      if (!leaderboard.has(aiId)) {
        leaderboard.set(aiId, 0);
      }

      aiPieces.set(aiId, {
        x,
        y,
        type: pieceType,
        lastMove: Date.now() + Math.random() * AI_CONFIG.moveInterval,
        thinkingDeadline: Date.now() + Math.random() * 2000,
      });
    }
  }

  // Remove AI pieces that are too far from ALL players (or over target count)
  const minKeep = Math.max(AI_CONFIG.baseCount, Math.floor(targetAIPieces * 0.5));
  if (spawnedPlayers.length > 0) {
    for (const [aiId, aiPiece] of aiPieces) {
      if (aiPieces.size <= minKeep) break;

      let nearPlayer = false;
      for (const player of spawnedPlayers) {
        const meta = playerMetadata.get(player.id);
        if (!meta) continue;

        const dx = aiPiece.x - meta.kingX;
        const dy = aiPiece.y - meta.kingY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < AI_CONFIG.removalRadius) {
          nearPlayer = true;
          break;
        }
      }

      if (!nearPlayer) {
        setSquare(aiPiece.x, aiPiece.y, 0, 0);
        aiPieces.delete(aiId);
        leaderboard.delete(aiId);
        playerMetadata.delete(aiId);
      }
    }
  }

  // If over target, cull the farthest AI from any player
  while (aiPieces.size > targetAIPieces && aiPieces.size > minKeep) {
    let farthestId = null;
    let farthestDist = -1;

    for (const [aiId, aiPiece] of aiPieces) {
      let minDist = Infinity;
      for (const player of spawnedPlayers) {
        const meta = playerMetadata.get(player.id);
        if (!meta) continue;
        const dx = aiPiece.x - meta.kingX;
        const dy = aiPiece.y - meta.kingY;
        minDist = Math.min(minDist, Math.sqrt(dx * dx + dy * dy));
      }
      if (minDist > farthestDist) {
        farthestDist = minDist;
        farthestId = aiId;
      }
    }

    if (farthestId !== null) {
      const ai = aiPieces.get(farthestId);
      if (ai) setSquare(ai.x, ai.y, 0, 0);
      aiPieces.delete(farthestId);
      leaderboard.delete(farthestId);
      playerMetadata.delete(farthestId);
    } else {
      break;
    }
  }
}

// Make AI pieces move intelligently - aware of surroundings, prioritizes captures
function moveAIPieces() {
  if (!AI_CONFIG.enabled) return;
  if (aiPieces.size === 0) return;

  const toDelete = [];

  for (const [aiId, aiPiece] of aiPieces) {
    // Verify the piece at this position still belongs to this AI
    // (it may have been captured by a player)
    const currentPiece = spatialHash.get(aiPiece.x, aiPiece.y);
    if (currentPiece.team !== aiId) {
      toDelete.push(aiId);
      continue;
    }

    // Check if AI is still thinking (independent of cooldown)
    const now = Date.now();
    if (!aiPiece.thinkingDeadline) {
      // Initialize thinking deadline if not set (for old AI pieces)
      aiPiece.thinkingDeadline = now + Math.random() * 2000;
    }
    if (now < aiPiece.thinkingDeadline) continue; // Still thinking, can't move yet

    // Random chance to move
    if (Math.random() > AI_CONFIG.moveChance) continue;

    // Don't move too frequently (with per-piece jitter for natural feel)
    const jitter = (aiId % 7) * 100; // 0-600ms offset based on ID
    if (Date.now() - aiPiece.lastMove < AI_CONFIG.moveInterval + jitter) continue;

    // Generate legal moves with range scaling based on AI's kills
    const aiKills = leaderboard.get(aiId) || 0;
    const legalMoves = generateLegalMoves(
      aiPiece.x,
      aiPiece.y,
      spatialHash,
      aiId,
      aiKills,
    );

    if (legalMoves.length === 0) continue;

    // Categorize moves: captures vs empty squares
    const captureMoves = [];
    const emptyMoves = [];

    for (const [mx, my] of legalMoves) {
      const target = spatialHash.get(mx, my);
      if (target.type !== 0 && target.team !== aiId) {
        // Skip immune players
        if (target.team > 0 && target.team < AI_ID_MIN) {
          const immuneUntil = spawnImmunity.get(target.team);
          if (immuneUntil && Date.now() < immuneUntil) {
            continue;
          }
        }
        // Prioritize player captures highest, then neutral, then other AI
        let priority = 1;
        if (target.team > 0 && target.team < AI_ID_MIN) priority = 3; // Player piece - high priority
        else if (target.team === 0) priority = 2; // Neutral piece
        captureMoves.push({ x: mx, y: my, priority, pieceType: target.type });
      } else if (target.type === 0) {
        emptyMoves.push([mx, my]);
      }
    }

    let chosenMove = null;

    if (captureMoves.length > 0) {
      // Sort by priority (highest first), pick best capture
      captureMoves.sort((a, b) => b.priority - a.priority);
      // 80% chance to take the best capture, 20% random capture for variety
      const pick = Math.random() < 0.8 ? captureMoves[0] : captureMoves[Math.floor(Math.random() * captureMoves.length)];
      chosenMove = [pick.x, pick.y];
    } else if (emptyMoves.length > 0) {
      // No captures available - scan nearby for pieces to move toward
      const SCAN_RADIUS = 10;
      const nearbyPieces = spatialHash.queryRadius(aiPiece.x, aiPiece.y, SCAN_RADIUS);
      let bestTarget = null;
      let bestDist = Infinity;

      for (const nearby of nearbyPieces) {
        if (nearby.team === aiId) continue; // Skip self
        if (nearby.type === 0) continue;
        const dx = nearby.x - aiPiece.x;
        const dy = nearby.y - aiPiece.y;
        const dist = dx * dx + dy * dy;
        // Prefer player pieces, then neutral
        const bonus = (nearby.team > 0 && nearby.team < AI_ID_MIN) ? -20 : 0;
        if (dist + bonus < bestDist) {
          bestDist = dist + bonus;
          bestTarget = nearby;
        }
      }

      if (bestTarget && Math.random() < 0.6) {
        // Move toward the target - pick the empty move closest to it
        let closestMove = null;
        let closestDist = Infinity;
        for (const [mx, my] of emptyMoves) {
          const dx = mx - bestTarget.x;
          const dy = my - bestTarget.y;
          const dist = dx * dx + dy * dy;
          if (dist < closestDist) {
            closestDist = dist;
            closestMove = [mx, my];
          }
        }
        chosenMove = closestMove || emptyMoves[Math.floor(Math.random() * emptyMoves.length)];
      } else {
        // Random move
        chosenMove = emptyMoves[Math.floor(Math.random() * emptyMoves.length)];
      }
    }

    if (!chosenMove) continue;

    const [newX, newY] = chosenMove;
    const targetPiece = spatialHash.get(newX, newY);

    // Track captures for leaderboard
    const isCapture = targetPiece.type !== 0 && targetPiece.team !== aiId;

    // If capturing another AI piece, remove it from tracking
    if (targetPiece.team !== 0 && targetPiece.team >= AI_ID_MIN) {
      aiPieces.delete(targetPiece.team);
      leaderboard.delete(targetPiece.team);
    }

    // Execute move
    move(aiPiece.x, aiPiece.y, newX, newY, aiId);

    // Kill counting and evolution are handled inside move() — no extra increment needed here

    if (AI_CONFIG.verboseLog) {
      const meta = playerMetadata.get(aiId);
      const name = meta ? meta.name : `AI_${aiId}`;
      console.log(`[AI] ${name} ${isCapture ? 'captures' : 'moves'} (${aiPiece.x},${aiPiece.y}) → (${newX},${newY})`);
    }

    // Update AI piece position
    aiPiece.x = newX;
    aiPiece.y = newY;
    aiPiece.lastMove = Date.now();
    
    // Reset thinking deadline for next decision cycle (0-2s random thinking time)
    aiPiece.thinkingDeadline = Date.now() + Math.random() * 2000;
  }

  // Clean up captured AI entries
  for (const id of toDelete) {
    aiPieces.delete(id);
    leaderboard.delete(id);
  }
}

// Spawn pawn bots near a specific player (called after player spawns / on interval)
function spawnPawnBotsForPlayer(playerId) {
  const meta = playerMetadata.get(playerId);
  if (!meta || (meta.kingX === 0 && meta.kingY === 0)) return;

  const existing = playerPawnBots.get(playerId);
  const currentCount = existing ? existing.size : 0;
  const needed = PAWN_BOTS_PER_PLAYER - currentCount;
  if (needed <= 0) return;

  const cx = meta.kingX;
  const cy = meta.kingY;

  for (let i = 0; i < needed; i++) {
    let placed = false;
    for (let tries = 0; tries < 40; tries++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.floor(Math.random() * PAWN_BOT_SPAWN_RADIUS) + 2;
      const x = Math.round(cx + Math.cos(angle) * dist);
      const y = Math.round(cy + Math.sin(angle) * dist);

      if (spatialHash.has(x, y)) continue;

      // Pick a direction: +1 (down) or -1 (up) — pick whichever gives a legal move
      // Try both; prefer the one that gives a forward empty square
      let dir = null;
      for (const d of [-1, 1]) {
        const fwd = spatialHash.get(x, y + d);
        if (fwd.type === 0) { dir = d; break; }
      }
      if (dir === null) continue; // No valid forward square, skip

      if (nextPawnBotId >= PAWN_BOT_ID_MAX) nextPawnBotId = PAWN_BOT_ID_MIN;
      const botId = nextPawnBotId++;

      // Make sure this ID isn't already in use
      if (pawnBots.has(botId)) continue;

      setSquare(x, y, globalThis.PIECE_PAWN, botId);

      const botColor = teamToColor(botId);
      playerMetadata.set(botId, {
        name: `Pawn_${botId}`,
        color: botColor,
        kingX: x,
        kingY: y,
      });

      pawnBots.set(botId, { x, y, ownerId: playerId, dir, lastMove: Date.now() });

      if (!playerPawnBots.has(playerId)) playerPawnBots.set(playerId, new Set());
      playerPawnBots.get(playerId).add(botId);

      placed = true;
      break;
    }
    // If we couldn't place after 40 tries, just skip for this cycle
    if (!placed) break;
  }
}

// Remove all pawn bots belonging to a player
function cleanupPawnBots(playerId) {
  const bots = playerPawnBots.get(playerId);
  if (!bots) return;
  for (const botId of bots) {
    const bot = pawnBots.get(botId);
    if (bot) {
      setSquare(bot.x, bot.y, 0, 0);
      pawnBots.delete(botId);
      playerMetadata.delete(botId);
    }
  }
  playerPawnBots.delete(playerId);
}

// Move all pawn bots one step
function movePawnBots() {
  const now = Date.now();
  const toDelete = [];

  for (const [botId, bot] of pawnBots) {
    // Verify piece still belongs to this bot
    const currentPiece = spatialHash.get(bot.x, bot.y);
    if (currentPiece.team !== botId) {
      // Pawn was captured — clean up
      toDelete.push(botId);
      continue;
    }

    if (now - bot.lastMove < PAWN_BOT_MOVE_INTERVAL) continue;

    const dy = bot.dir; // +1 or -1
    const ny = bot.y + dy;

    // Collect candidate moves: forward + diagonal captures
    const candidates = [];

    const fwd = spatialHash.get(bot.x, ny);
    if (fwd.type === 0) candidates.push([bot.x, ny, false]);

    // Diagonal captures (enemy pieces only)
    for (const dx of [-1, 1]) {
      const diag = spatialHash.get(bot.x + dx, ny);
      if (diag.type !== 0 && diag.team !== botId) {
        // Skip immune players
        if (diag.team > 0 && diag.team < PAWN_BOT_ID_MIN) {
          const immuneUntil = spawnImmunity.get(diag.team);
          if (immuneUntil && now < immuneUntil) continue;
        }
        // Don't capture the owning player
        if (diag.team === bot.ownerId) continue;
        candidates.push([bot.x + dx, ny, true]);
      }
    }

    if (candidates.length === 0) {
      // Stuck — try flipping direction
      bot.dir = -bot.dir;
      bot.lastMove = now;
      continue;
    }

    // Prefer captures; otherwise pick randomly among forward moves
    const captures = candidates.filter(c => c[2]);
    const [newX, newY] = captures.length > 0
      ? captures[Math.floor(Math.random() * captures.length)]
      : candidates[Math.floor(Math.random() * candidates.length)];

    // If capturing another pawn bot, remove it from tracking
    const targetPiece = spatialHash.get(newX, newY);
    if (targetPiece.team >= PAWN_BOT_ID_MIN && targetPiece.team < PAWN_BOT_ID_MAX) {
      pawnBots.delete(targetPiece.team);
      playerMetadata.delete(targetPiece.team);
      // Remove from owner's set
      const ownerBots = playerPawnBots.get(targetPiece.team);
      if (ownerBots) {
        for (const [pid, bset] of playerPawnBots) {
          if (bset.has(targetPiece.team)) { bset.delete(targetPiece.team); break; }
        }
      }
    }

    move(bot.x, bot.y, newX, newY, botId);

    bot.x = newX;
    bot.y = newY;
    bot.lastMove = now;

    const updatedMeta = playerMetadata.get(botId);
    if (updatedMeta) { updatedMeta.kingX = newX; updatedMeta.kingY = newY; }
  }

  for (const botId of toDelete) {
    // Remove from owning player's set
    for (const [pid, bset] of playerPawnBots) {
      if (bset.has(botId)) { bset.delete(botId); break; }
    }
    pawnBots.delete(botId);
    playerMetadata.delete(botId);
  }
}

// Periodic: ensure every live player has their pawn bot complement
function spawnPawnBots() {
  for (const client of Object.values(clients)) {
    if (!client.verified || client.dead) continue;
    spawnPawnBotsForPlayer(client.id);
  }
}

// Run AI systems if enabled
if (AI_CONFIG.enabled) {
  setInterval(spawnAIPieces, 2000);
  setInterval(moveAIPieces, 1000);
  setInterval(spawnPawnBots, 3000);
  setInterval(movePawnBots, PAWN_BOT_MOVE_INTERVAL);
  // Debounced leaderboard broadcast — only sends when dirty (P3)
  setInterval(() => {
    if (leaderboardDirty && Object.keys(clients).length > 0) {
      leaderboardDirty = false;
      broadcastToAll(sendLeaderboard());
    }
  }, 500);
  console.log(
    `[AI] System enabled - base ${AI_CONFIG.baseCount}, solo bonus ${AI_CONFIG.soloBonus}, +${AI_CONFIG.piecesPerPlayer}/player, max ${AI_CONFIG.maxAI}`,
  );
} else {
  console.log(`[AI] System disabled`);
}

// Neutralize disconnected players' pieces
setInterval(() => {
  if (teamsToNeutralize.length === 0) return;

  const teamsToRemove = [...teamsToNeutralize];
  teamsToNeutralize = [];

  // Use Set for O(1) lookups instead of Array.includes (P2)
  const teamSet = new Set(teamsToRemove);

  // Find and neutralize all pieces belonging to disconnected teams
  const allPieces = spatialHash.getAllPieces();

  for (const piece of allPieces) {
    if (teamSet.has(piece.team)) {
      spatialHash.set(piece.x, piece.y, piece.type, 0);
      setSquare(piece.x, piece.y, piece.type, 0);
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

    // Write-then-rename to prevent corruption on crash (E2)
    const tmpPath = WORLD_SAVE_PATH + ".tmp";
    await fs.writeFile(tmpPath, Buffer.from(buf.buffer));
    await fs.rename(tmpPath, WORLD_SAVE_PATH);
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
      if (playerId >= AI_ID_MIN) continue; // Don't save AI data
      data.push({
        id: playerId,
        name: meta.name,
        color: meta.color,
        kills: leaderboard.get(playerId) || 0,
      });
    }

    // Write-then-rename to prevent corruption on crash (E2)
    const tmpPath = PLAYER_SAVE_PATH + ".tmp";
    await fs.writeFile(tmpPath, JSON.stringify(data));
    await fs.rename(tmpPath, PLAYER_SAVE_PATH);
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
loadTop3();
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
      ws.chatMsgsLastWindow = 0;
      ws.lastChatWindowTime = 0;
      ws.camera = { x: 0, y: 0, scale: 1 };
      ws.msgCount = 0;
      ws.msgWindowStart = Date.now();

      ws.subscribe("global");

      // Don't send initial board state yet - wait for spawn/captcha
      leaderboard.set(ws.id, 0);
      broadcastToAll(sendLeaderboard());

      // Send all-time top 3 to new client
      if (allTimeTop3.length > 0) {
        send(ws, sendTop3());
      }
    },

    message: (ws, data) => {
      // Per-connection message rate limiting (R3) — max 60 msgs/sec
      const now = Date.now();
      if (now - ws.msgWindowStart > 1000) {
        ws.msgCount = 0;
        ws.msgWindowStart = now;
      }
      ws.msgCount++;
      if (ws.msgCount > 60) return; // Silently drop excessive messages

      const u8 = new Uint8Array(data);

      // Camera position update (client sends grid coordinates as Int32)
      if (data.byteLength === 16) {
        const decoded = new Int32Array(data);
        if (decoded[0] === 55552) {
          // Validate camera coords are finite (R1 extension)
          if (!Number.isFinite(decoded[1]) || !Number.isFinite(decoded[2]) || !Number.isFinite(decoded[3])) return;

          // Client sends grid coords directly
          ws.camera.x = decoded[1];
          ws.camera.y = decoded[2];
          ws.camera.scale = Math.max(0.01, Math.min(10, decoded[3] / 100)); // Clamp scale

          // Send viewport syncs for any verified client (players + spectators)
          if (ws.verified) {
            const now = Date.now();
            if (!ws.lastViewportSync || now - ws.lastViewportSync > 2000) {
              ws.lastViewportSync = now;
              sendViewportState(ws, ws.camera.x, ws.camera.y);
            }
          }
          return;
        }
      }

      // Session resume (magic 55557 as first 2 bytes + 32-byte token string)
      // Client sends this on reconnect to restore their previous session
      const dv = new DataView(data);
      const firstU16 = data.byteLength >= 2 ? dv.getUint16(0, true) : 0;
      if (firstU16 === 55557 && data.byteLength >= 34) {
        const token = decodeText(u8, 2, 34);

        const session = sessions.get(token);
        if (!session) {
          // Session not found or expired — send rejection (magic 55558, status 0)
          const rejectBuf = new Uint8Array(4);
          const rejectU16 = new Uint16Array(rejectBuf.buffer);
          rejectU16[0] = 55558;
          rejectU16[1] = 0; // 0 = rejected
          send(ws, rejectBuf);
          console.log(`[Session] Resume rejected — token not found`);
          return;
        }

        // Restore the session — reuse the old player ID
        const oldId = ws.id;
        delete clients[oldId];
        leaderboard.delete(oldId);

        ws.id = session.id;
        clients[ws.id] = ws;
        ws.verified = true;
        ws.dead = false;
        ws.sessionToken = token;
        ws.camera.x = session.kingX;
        ws.camera.y = session.kingY;

        // Restore metadata and leaderboard
        playerMetadata.set(ws.id, {
          name: session.name,
          color: session.color,
          kingX: session.kingX,
          kingY: session.kingY,
        });
        leaderboard.set(ws.id, session.kills);

        // Remove the session from the store
        sessions.delete(token);

        // Grant brief spawn immunity on reconnect
        spawnImmunity.set(ws.id, Date.now() + SPAWN_IMMUNITY_MS);
        const immuneBuf = new Uint16Array(3);
        immuneBuf[0] = 55556;
        immuneBuf[1] = ws.id;
        immuneBuf[2] = Math.floor(SPAWN_IMMUNITY_MS / 100);
        broadcastToAll(immuneBuf);

        // Send acceptance (magic 55558, status 1) + session data
        // Format: [magic(2), status(2), id(2), kills(2), pieceType(2), kingX(4), kingY(4), nameLen(1), ...name]
        const nameBuf = new TextEncoder().encode(session.name);
        const acceptLen = 10 + 8 + 1 + nameBuf.length;
        const padLen = acceptLen % 2 === 0 ? acceptLen : acceptLen + 1;
        const acceptBuf = new Uint8Array(padLen);
        const acceptU16 = new Uint16Array(acceptBuf.buffer, 0, 5);
        acceptU16[0] = 55558;
        acceptU16[1] = 1; // 1 = accepted
        acceptU16[2] = ws.id;
        acceptU16[3] = session.kills;
        acceptU16[4] = session.pieceType;
        // Write kingX and kingY as Int32 at byte offset 10
        const acceptDV = new DataView(acceptBuf.buffer);
        acceptDV.setInt32(10, session.kingX, true);
        acceptDV.setInt32(14, session.kingY, true);
        acceptBuf[18] = nameBuf.length;
        for (let j = 0; j < nameBuf.length; j++) acceptBuf[19 + j] = nameBuf[j];
        send(ws, acceptBuf);

        console.log(`[Session] Resumed: ${session.name} (#${ws.id}) at (${session.kingX},${session.kingY}) with ${session.kills} kills`);

        // Send viewport centered on their piece
        sendViewportState(ws, session.kingX, session.kingY);
        leaderboardDirty = true;
        return;
      }

      // Player info (name and color and piece type)
      if (firstU16 === 55551) {
        const nameLength = Math.min(u8[2] || 0, data.byteLength - 8, 32); // Cap name read length
        if (data.byteLength < 8) return; // Malformed packet
        const r = u8[3];
        const g = u8[4];
        const b = u8[5];
        const pieceType = u8[6] || 6; // Default to king (evolution start)

        let name = decodeText(u8, 8, 8 + nameLength);

        // Sanitize name — strip special chars, filter profanity server-side
        name = name.replace(/[^a-zA-Z0-9_\-\s]/g, "").substring(0, 16);
        if (name.length === 0) name = "Player" + ws.id;
        name = cleanBadWords(name);

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

        // Spawn the player immediately after receiving their info
        // Block duplicate spawns — only spawn if not already alive with a piece on the board (R4)
        const existingMeta = playerMetadata.get(ws.id);
        const alreadySpawned = ws.verified && !ws.dead && existingMeta && existingMeta.kingX !== undefined
          && spatialHash.get(existingMeta.kingX, existingMeta.kingY).team === ws.id;
        if (!ws.dead && !alreadySpawned) {
          console.log(`[Spawn] Player ${ws.id} (${name}) spawning... ws.closed=${ws.closed}`);

          const spawnPieceType = globalThis.PIECE_KING; // 6
          const spawn = findSpawnLocation(spawnPieceType);
          console.log(`[Spawn] Location: (${spawn.x}, ${spawn.y}), pieceType=${spawnPieceType}`);

          // Mark as verified and set camera BEFORE placing piece
          ws.verified = true;
          ws.dead = false;
          ws.camera.x = spawn.x;
          ws.camera.y = spawn.y;

          // Place piece on board
          spatialHash.set(spawn.x, spawn.y, spawnPieceType, ws.id);

          // Verify piece was placed
          const verify = spatialHash.get(spawn.x, spawn.y);
          console.log(`[Spawn] Verify piece at (${spawn.x},${spawn.y}): type=${verify.type}, team=${verify.team}`);

          // Update metadata with spawn position
          const meta = playerMetadata.get(ws.id);
          meta.kingX = spawn.x;
          meta.kingY = spawn.y;

          // Grant spawn immunity
          spawnImmunity.set(ws.id, Date.now() + SPAWN_IMMUNITY_MS);
          const immuneBuf = new Uint16Array(3);
          immuneBuf[0] = 55556;
          immuneBuf[1] = ws.id;
          immuneBuf[2] = Math.floor(SPAWN_IMMUNITY_MS / 100);
          broadcastToAll(immuneBuf);

          // 1) Send viewport FIRST — this sets selfId on the client
          sendViewportState(ws, spawn.x, spawn.y);
          console.log(`[Spawn] Sent viewport to player ${ws.id}`);

          // 2) THEN send direct setSquare — client now knows selfId so spawn detection works
          const spawnBuf = new Int32Array(5);
          spawnBuf[0] = 55555;
          spawnBuf[1] = spawn.x;
          spawnBuf[2] = spawn.y;
          spawnBuf[3] = spawnPieceType;
          spawnBuf[4] = ws.id;
          send(ws, spawnBuf.buffer);

          // Generate and send session token for reconnection
          ws.sessionToken = generateSessionToken();
          const tokenBuf = new Uint8Array(2 + 32);
          const tokenU16 = new Uint16Array(tokenBuf.buffer, 0, 1);
          tokenU16[0] = 55559; // Magic: session token assignment
          const tokenBytes = new TextEncoder().encode(ws.sessionToken);
          for (let t = 0; t < 32; t++) tokenBuf[2 + t] = tokenBytes[t];
          send(ws, tokenBuf);

          console.log(`[Spawn] ✓ Player ${ws.id} (${name}) at (${spawn.x}, ${spawn.y})`);
        }

        return;
      }

      // Auto-verify all clients (captcha removed)
      if (ws.verified === false) {
        if (!playerMetadata.has(ws.id)) {
          playerMetadata.set(ws.id, {
            name: teamToName(ws.id),
            color: teamToColor(ws.id),
            kingX: 0,
            kingY: 0,
          });
        }
        ws.verified = true;
        return;
      }

      // Dead players: handle respawn trigger
      if (ws.dead === true) {
        if (Date.now() < ws.respawnTime) return;

        const meta = playerMetadata.get(ws.id);
        if (!meta || !meta.name) return;

        console.log(`[Respawn] Player ${ws.id} (${meta.name}) respawning...`);

        const pieceType = globalThis.PIECE_KING;
        const spawn = findSpawnLocation(pieceType);

        ws.dead = false;
        ws.camera.x = spawn.x;
        ws.camera.y = spawn.y;

        // Reset kills so evolution restarts from King
        leaderboard.set(ws.id, 0);

        setSquare(spawn.x, spawn.y, pieceType, ws.id);

        spawnImmunity.set(ws.id, Date.now() + SPAWN_IMMUNITY_MS);
        const immuneBuf = new Uint16Array(3);
        immuneBuf[0] = 55556;
        immuneBuf[1] = ws.id;
        immuneBuf[2] = Math.floor(SPAWN_IMMUNITY_MS / 100);
        broadcastToAll(immuneBuf);

        meta.kingX = spawn.x;
        meta.kingY = spawn.y;

        // Generate new session token for the respawned player
        ws.sessionToken = generateSessionToken();
        const tokenBuf = new Uint8Array(2 + 32);
        const tokenU16 = new Uint16Array(tokenBuf.buffer, 0, 1);
        tokenU16[0] = 55559;
        const tokenBytes = new TextEncoder().encode(ws.sessionToken);
        for (let t = 0; t < 32; t++) tokenBuf[2 + t] = tokenBytes[t];
        send(ws, tokenBuf);

        console.log(`[Respawn] ✓ Player ${ws.id} (${meta.name}) at ${toChessNotation(spawn.x, spawn.y)}`);
        // 1) Send viewport FIRST — updates selfId on client
        sendViewportState(ws, spawn.x, spawn.y);
        // 2) THEN send direct setSquare for own piece — triggers isSpawn detection on client
        //    (same as initial spawn path), which resets gameOver and recenters camera
        const spawnBuf = new Int32Array(5);
        spawnBuf[0] = 55555;
        spawnBuf[1] = spawn.x;
        spawnBuf[2] = spawn.y;
        spawnBuf[3] = pieceType;
        spawnBuf[4] = ws.id;
        send(ws, spawnBuf.buffer);
        return;
      }

      if (data.byteLength % 2 !== 0) return;
      const decoded = new Uint16Array(data.byteLength >= 2 ? data : new ArrayBuffer(0));

      // Chat message
      if (decoded[0] === 47095) {
        if (data.byteLength > 1000) return;

        const now = Date.now();
        if (now - ws.lastChatWindowTime > 10000) {
          ws.chatMsgsLastWindow = 0;
          ws.lastChatWindowTime = now;
        }

        ws.chatMsgsLastWindow++;
        if (ws.chatMsgsLastWindow > 3) {
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

        let chatMessage = cleanBadWords(txt);
        let id = ws.id;

        // /announce is admin-only (disabled for regular players)
        if (chatMessage.slice(0, 9) === "/announce") {
          return;
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

      // Move piece (Int32Array: [magic, startX, startY, finX, finY] = 20 bytes)
      else if (data.byteLength === 20) {
        const moveData = new Int32Array(data);
        if (moveData[0] !== 55550) return; // Magic number for move
        const now = Date.now();
        if (now - ws.lastMovedTime < moveCooldown) return;

        const startX = moveData[1];
        const startY = moveData[2];
        const finX = moveData[3];
        const finY = moveData[4];

        // Validate coordinates are finite integers (R1)
        if (!Number.isFinite(startX) || !Number.isFinite(startY) ||
            !Number.isFinite(finX) || !Number.isFinite(finY)) return;

        const startPiece = spatialHash.get(startX, startY);

        // Validate ownership
        if (startPiece.team !== ws.id) return;

        // Clear spawn immunity on first move
        if (spawnImmunity.has(ws.id)) {
          spawnImmunity.delete(ws.id);
        }

        // Validate move legality (range scales with kills)
        const playerKills = leaderboard.get(ws.id) || 0;
        const legalMoves = generateLegalMoves(
          startX,
          startY,
          spatialHash,
          ws.id,
          playerKills,
        );

        let isLegal = false;
        for (const [mx, my] of legalMoves) {
          if (mx === finX && my === finY) {
            isLegal = true;
            break;
          }
        }

        if (!isLegal) return;

        // Block captures of immune players
        const targetPiece = spatialHash.get(finX, finY);
        if (targetPiece.type !== 0 && targetPiece.team < AI_ID_MIN && targetPiece.team > 0) {
          const immuneUntil = spawnImmunity.get(targetPiece.team);
          if (immuneUntil && Date.now() < immuneUntil) return;
        }

        move(startX, startY, finX, finY, ws.id);
        ws.lastMovedTime = now;
      }
    },

    close: (ws) => {
      delete clients[ws.id];
      ws.closed = true;

      const meta = playerMetadata.get(ws.id);
      const kills = leaderboard.get(ws.id) || 0;

      // If the player was alive with a piece, save session for reconnection
      if (meta && meta.name && !ws.dead && ws.verified) {
        const token = ws.sessionToken || generateSessionToken();
        const currentPiece = spatialHash.get(meta.kingX, meta.kingY);
        const pieceType = (currentPiece && currentPiece.team === ws.id) ? currentPiece.type : 0;

        if (pieceType !== 0) {
          sessions.set(token, {
            id: ws.id,
            name: meta.name,
            color: meta.color,
            kills: kills,
            kingX: meta.kingX,
            kingY: meta.kingY,
            pieceType: pieceType,
            expiry: Date.now() + SESSION_TTL,
          });
          console.log(`[Session] Saved: ${meta.name} (#${ws.id}) — ${SESSION_TTL / 1000}s to reconnect`);
          // Don't neutralize yet — session cleanup will handle it if they don't reconnect
      } else {
        // No piece on board, neutralize immediately
        if (ws.id) teamsToNeutralize.push(ws.id);
        leaderboard.delete(ws.id);
        playerMetadata.delete(ws.id);
        cleanupPawnBots(ws.id);
      }
    } else {
      // Dead or unverified player — clean up immediately
      if (ws.id) teamsToNeutralize.push(ws.id);
      spawnImmunity.delete(ws.id);
      leaderboard.delete(ws.id);
      playerMetadata.delete(ws.id);
      cleanupPawnBots(ws.id);
    }

      leaderboardDirty = true;

      if (ws.ip) {
        connectedIps[ws.ip] = (connectedIps[ws.ip] || 1) - 1;
        if (connectedIps[ws.ip] <= 0) delete connectedIps[ws.ip];
      }
    },

    upgrade: (res, req, context) => {
      let ip = getIp(res, req);

      if (ip !== undefined) {
        // Allow up to 3 connections per IP (R5) — supports multiple tabs / NAT
        const count = connectedIps[ip] || 0;
        if (count >= 3) {
          res.end("Connection rejected");
          console.log("ws ratelimit", ip);
          return;
        }
        connectedIps[ip] = count + 1;
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

  // Disable caching for index.html (sitekey is injected dynamically)
  res.writeHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.writeHeader("Pragma", "no-cache");
  res.writeHeader("Expires", "0");

  let html = fsSync.readFileSync("client/index.html", "utf-8");
  res.end(html);
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

  let filePath = req.getParameter(0) + "/" + req.getParameter(1);

  // Prevent path traversal (R2)
  const resolved = pathModule.resolve(filePath);
  if (!resolved.startsWith(process.cwd())) {
    res.cork(() => { res.writeStatus("403 Forbidden"); res.end(); });
    return;
  }

  if (fsSync.existsSync(filePath) && fsSync.statSync(filePath).isFile()) {
    const ext = pathModule.extname(filePath).toLowerCase();
    const MIME_TYPES = { '.css': 'text/css', '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.mp3': 'audio/mpeg' };
    res.writeHeader("Content-Type", MIME_TYPES[ext] || "application/octet-stream");

    // Disable caching in development for hot reloading
    if (!isProd) {
      res.writeHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.writeHeader("Pragma", "no-cache");
      res.writeHeader("Expires", "0");
    }

    res.end(fsSync.readFileSync(filePath));
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

  let assetPath = "client/assets/" + req.getParameter(0);

  // Prevent path traversal (R2)
  const resolvedAsset = pathModule.resolve(assetPath);
  if (!resolvedAsset.startsWith(process.cwd())) {
    res.cork(() => { res.writeStatus("403 Forbidden"); res.end(); });
    return;
  }

  if (fsSync.existsSync(assetPath) && fsSync.statSync(assetPath).isFile()) {
    const ext = pathModule.extname(assetPath).toLowerCase();
    if (ext === ".png") res.writeHeader("Content-Type", "image/png");
    else res.writeHeader("Content-Type", "audio/mpeg");
    res.end(fsSync.readFileSync(assetPath));
  } else {
    res.cork(() => {
      res.writeStatus("404 Not Found");
      res.end();
    });
  }
});

// Profanity filter — uses bad-words npm package (no inline word lists)
function isBadWord(str) {
  try {
    return profanityFilter.isProfane(str);
  } catch (e) {
    return false;
  }
}

function cleanBadWords(str) {
  try {
    return profanityFilter.clean(str);
  } catch (e) {
    return str;
  }
}

const encoder = new TextEncoder();
function encodeAtPosition(string, u8array, position) {
  return encoder.encodeInto(
    string,
    position ? u8array.subarray(position | 0) : u8array,
  );
}
