import uWS from 'uWebSockets.js';
import fs from 'fs';
import '../shared/constants.js';
import badWords from './badwords.js';
import { closest } from 'color-2-name';

import { networkInterfaces } from 'os';

const captchaSecretKey = "[captcha key]"

function serverIp(){
    const nets = networkInterfaces();
    const results = {};
    
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            const familyV4Value = typeof net.family === 'string' ? 'IPv4' : 4
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

const info = serverIp();
const isProd = !(Array.isArray(info['Wi-Fi']) && info['Wi-Fi'][0] === 'your local developer ip address');
console.log({isProd});

// Initialize spatial hash for infinite world
const spatialHash = new SpatialHash();
global.spatialHash = spatialHash;

// Player metadata store (name, color, etc.)
const playerMetadata = new Map(); // playerId -> {name, color, kingX, kingY}

let leaderboard = new Map();

function sendLeaderboard(){
    const leaderboardData = [];
    let bufLen = 1;
    
    for(const [playerId, kills] of leaderboard){
        const metadata = playerMetadata.get(playerId);
        const name = metadata ? metadata.name : teamToName(playerId);
        const nameLen = name.length;
        
        leaderboardData.push({ id: playerId, kills, name, nameLen });
        let add = nameLen;
        if(add % 2 === 1) add++;
        bufLen += add + 6;
    }
    
    if(bufLen % 2 === 1) bufLen++;
    
    const buf = new Uint8Array(bufLen);
    const u16 = new Uint16Array(buf.buffer);
    u16[0] = 48027;

    let i = 1;
    for(const d of leaderboardData){
        u16[i++] = d.id;
        u16[i++] = d.kills;
        u16[i++] = d.nameLen;
        encodeAtPosition(d.name, buf, i * 2);
        i += Math.ceil(d.nameLen / 2);
    }

    return buf;
}

// Seeded RNG for team colors
function teamToColor(team){
    let num = Math.round((Math.sin(team * 10000) + 1) / 2 * 0xFFFFFF);
    let r = (num & 0xFF0000) >>> 16;
    let g = (num & 0x00FF00) >>> 8;
    let b = (num & 0x0000FF);

    if(r + g + b > 520){
        r /= 2;
        g /= 2;
        b /= 2;
    }

    return {r, g, b};
}

function teamToName(team){
    const color = teamToColor(team);
    return closest(`rgb(${color.r}, ${color.g}, ${color.b})`).name;
}

// Set square and broadcast to relevant players only
function setSquare(x, y, piece, team){
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
function move(startX, startY, finX, finY, playerId){
    const startPiece = spatialHash.get(startX, startY);
    const endPiece = spatialHash.get(finX, finY);
    
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
    if(Math.abs(finX - startX) > 1000 || Math.abs(finY - startY) > 1000) {
        broadcastToViewport(finX, finY, buf);
    }

    // Capture logic: captured neutral pieces become yours
    if(endPiece.type !== 0 && endPiece.team === 0){
        setSquare(startX, startY, endPiece.type, playerId);
    }

    // King capture: eliminate player
    if(endPiece.type === 6 && endPiece.team !== 0 && clients[endPiece.team] !== undefined){
        const victimId = endPiece.team;
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

// Broadcast to players whose viewport contains a point
function broadcastToViewport(x, y, message){
    const VIEWPORT_RADIUS = 3000; // pixels (in world coordinates)
    
    for(const client of Object.values(clients)){
        if(!client.camera || !client.verified) continue;
        
        const dx = x - client.camera.x;
        const dy = y - client.camera.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        // Scale radius by zoom level
        const effectiveRadius = VIEWPORT_RADIUS / (client.camera.scale || 1);
        
        if(dist < effectiveRadius){
            send(client, message);
        }
    }
}

// Broadcast to all connected clients
function broadcastToAll(message){
    app.publish('global', message, true, false);
}

// Find spawn location with king safety buffer
function findSpawnLocation(){
    const SPAWN_RADIUS = 50000; // Search within this radius from origin
    const KING_BUFFER = 4; // Kings can't spawn within 4 squares of each other
    
    for(let tries = 0; tries < 100; tries++){
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * SPAWN_RADIUS;
        const x = Math.floor(Math.cos(angle) * dist);
        const y = Math.floor(Math.sin(angle) * dist);
        
        // Check if empty
        if(spatialHash.has(x, y)) continue;
        
        // Check for nearby kings
        let tooClose = false;
        const nearbyPieces = spatialHash.queryRect(x - KING_BUFFER, y - KING_BUFFER, x + KING_BUFFER, y + KING_BUFFER);
        
        for(const piece of nearbyPieces){
            if(piece.type === 6){
                tooClose = true;
                break;
            }
        }
        
        if(!tooClose) return {x, y};
    }
    
    // Fallback: random location (might be occupied, but we'll handle that)
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * SPAWN_RADIUS;
    return {
        x: Math.floor(Math.cos(angle) * dist),
        y: Math.floor(Math.sin(angle) * dist)
    };
}

// Send viewport state to a client
function sendViewportState(ws, centerX, centerY){
    const VIEWPORT_RADIUS = 30; // Reduced from 50 for faster initial load
    
    const pieces = spatialHash.queryRect(
        centerX - VIEWPORT_RADIUS,
        centerY - VIEWPORT_RADIUS,
        centerX + VIEWPORT_RADIUS,
        centerY + VIEWPORT_RADIUS
    );
    
    // Limit pieces sent to prevent huge messages
    const maxPieces = Math.min(pieces.length, 500);
    
    // Format: [magic, playerId, count, x, y, type, team, x, y, type, team...]
    const buf = new Uint16Array(3 + maxPieces * 4);
    buf[0] = 55553; // Magic number for viewport sync
    buf[1] = ws.id;
    buf[2] = maxPieces;
    
    let i = 3;
    for(let j = 0; j < maxPieces; j++){
        const piece = pieces[j];
        buf[i++] = piece.x;
        buf[i++] = piece.y;
        buf[i++] = piece.type;
        buf[i++] = piece.team;
    }
    
    send(ws, buf);
    
    if(pieces.length > maxPieces){
        console.log(`[Viewport] Sent ${maxPieces}/${pieces.length} pieces to player ${ws.id}`);
    }
}

const PORT = 3000;
global.clients = {};
let connectedIps = {};
let id = 1;

function generateId(){
    if(id >= 65532) id = 1;
    return id++;
}

const decoder = new TextDecoder();
function decodeText(u8array, startPos=0, endPos=Infinity){
    return decoder.decode(u8array).slice(startPos, endPos);
}

// Piece spawner using procedural generation
setInterval(() => {
    const pieceCount = spatialHash.count();
    const targetPieces = 5000; // Target number of neutral pieces
    
    if(pieceCount >= targetPieces) return;
    
    // Spawn a few pieces
    for(let i = 0; i < 5; i++){
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * 50000;
        const x = Math.floor(Math.cos(angle) * dist);
        const y = Math.floor(Math.sin(angle) * dist);
        
        // Use procedural generation
        const pieceType = getProceduralPiece(x, y);
        if(pieceType !== 0 && !spatialHash.has(x, y)){
            setSquare(x, y, pieceType, 0);
        }
    }
}, 100);

let teamsToNeutralize = [];

// Neutralize disconnected players' pieces
setInterval(() => {
    if(teamsToNeutralize.length === 0) return;
    
    const teamsToRemove = [...teamsToNeutralize];
    teamsToNeutralize = [];
    
    // Find and neutralize all pieces belonging to disconnected teams
    const allPieces = spatialHash.getAllPieces();
    
    for(const piece of allPieces){
        if(teamsToRemove.includes(piece.team)){
            if(piece.type === 6){
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
    for(let i = 0; i < teamsToRemove.length; i++){
        buf[i + 2] = teamsToRemove[i];
    }
    broadcastToAll(buf);
}, 440);

// Cleanup captcha keys
let usedCaptchaKeys = {};
setInterval(() => {
    const now = Date.now();
    for(const key in usedCaptchaKeys){
        if(now - usedCaptchaKeys[key] > 2 * 60 * 1000){
            delete usedCaptchaKeys[key];
        }
    }
}, 2 * 60 * 1000);

// World Persistence - Save/Load
const WORLD_SAVE_PATH = 'server/world.dat';
const PLAYER_SAVE_PATH = 'server/players.dat';

function saveWorld(){
    try {
        const pieces = spatialHash.getAllPieces();
        
        // Filter out player-owned pieces (only save neutral pieces)
        const neutralPieces = pieces.filter(p => p.team === 0 && p.type !== 0);
        
        // Format: [count, x, y, type, x, y, type, ...]
        const buf = new Int32Array(1 + neutralPieces.length * 3);
        buf[0] = neutralPieces.length;
        
        let i = 1;
        for(const piece of neutralPieces){
            buf[i++] = piece.x;
            buf[i++] = piece.y;
            buf[i++] = piece.type;
        }
        
        fs.writeFileSync(WORLD_SAVE_PATH, Buffer.from(buf.buffer));
        console.log(`[Persistence] Saved ${neutralPieces.length} neutral pieces`);
    } catch(e){
        console.error('[Persistence] Failed to save world:', e);
    }
}

function loadWorld(){
    try {
        if(!fs.existsSync(WORLD_SAVE_PATH)){
            console.log('[Persistence] No save file found, starting fresh world');
            return;
        }
        
        const data = fs.readFileSync(WORLD_SAVE_PATH);
        const buf = new Int32Array(data.buffer, data.byteOffset, data.byteLength / 4);
        
        const count = buf[0];
        console.log(`[Persistence] Loading ${count} neutral pieces`);
        
        let i = 1;
        for(let j = 0; j < count; j++){
            const x = buf[i++];
            const y = buf[i++];
            const type = buf[i++];
            
            spatialHash.set(x, y, type, 0);
        }
        
        console.log('[Persistence] World loaded successfully');
    } catch(e){
        console.error('[Persistence] Failed to load world:', e);
    }
}

function savePlayerMetadata(){
    try {
        const data = [];
        for(const [playerId, meta] of playerMetadata){
            data.push({
                id: playerId,
                name: meta.name,
                color: meta.color,
                kills: leaderboard.get(playerId) || 0
            });
        }
        
        fs.writeFileSync(PLAYER_SAVE_PATH, JSON.stringify(data));
        console.log(`[Persistence] Saved ${data.length} player records`);
    } catch(e){
        console.error('[Persistence] Failed to save players:', e);
    }
}

function loadPlayerMetadata(){
    try {
        if(!fs.existsSync(PLAYER_SAVE_PATH)){
            console.log('[Persistence] No player data found');
            return;
        }
        
        const data = JSON.parse(fs.readFileSync(PLAYER_SAVE_PATH, 'utf8'));
        
        for(const record of data){
            playerMetadata.set(record.id, {
                name: record.name,
                color: record.color,
                kingX: 0,
                kingY: 0
            });
            
            if(record.kills > 0){
                leaderboard.set(record.id, record.kills);
            }
        }
        
        console.log(`[Persistence] Loaded ${data.length} player records`);
    } catch(e){
        console.error('[Persistence] Failed to load players:', e);
    }
}

// Auto-save every 60 seconds
setInterval(() => {
    saveWorld();
    savePlayerMetadata();
}, 60 * 1000);

// Save on graceful shutdown
process.on('SIGINT', () => {
    console.log('\n[Shutdown] Saving world...');
    saveWorld();
    savePlayerMetadata();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n[Shutdown] Saving world...');
    saveWorld();
    savePlayerMetadata();
    process.exit(0);
});

// Load world on startup
console.log('[Startup] Loading world...');
loadWorld();
loadPlayerMetadata();

// WebSocket handlers
global.app = uWS.App().ws('/*', {
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
        
        ws.subscribe('global');
        
        // Don't send initial board state yet - wait for spawn/captcha
        leaderboard.set(ws.id, 0);
        broadcastToAll(sendLeaderboard());
    },
    
    message: (ws, data) => {
        const u8 = new Uint8Array(data);
        
        // Camera position update (new message type)
        if(data.byteLength === 12){
            const decoded = new Int16Array(data);
            if(decoded[0] === 55552){
                ws.camera.x = decoded[1];
                ws.camera.y = decoded[2];
                ws.camera.scale = decoded[3] / 100; // Scale stored as integer * 100
                
                // Send viewport state if needed (throttled)
                const now = Date.now();
                if(!ws.lastViewportSync || now - ws.lastViewportSync > 1000){
                    ws.lastViewportSync = now;
                    sendViewportState(ws, ws.camera.x, ws.camera.y);
                }
                return;
            }
        }
        
        // Player info (name and color)
        if(u8[0] === 55551){
            const nameLength = u8[1];
            const r = u8[2];
            const g = u8[3];
            const b = u8[4];
            
            let name = decodeText(u8, 5, 5 + nameLength);
            
            // Sanitize name
            name = name.replace(/[^a-zA-Z0-9_\-\s]/g, '').substring(0, 16);
            if(name.length === 0) name = 'Player' + ws.id;
            
            // Store player metadata
            playerMetadata.set(ws.id, {
                name: name,
                color: {r, g, b},
                kingX: 0,
                kingY: 0
            });
            
            console.log(`Player ${ws.id} set name: ${name}, color: rgb(${r},${g},${b})`);
            
            // Broadcast updated leaderboard with new name
            broadcastToAll(sendLeaderboard());
            return;
        }
        
        // Unverified players: handle captcha and spawn
        if(ws.verified === false || (ws.dead === true && !(u8[0] === 0xf7 && u8[1] === 0xb7))){
            (async() => {
                if(ws.verified === false){
                    // Captcha verification
                    const captchaKey = decodeText(u8);
                    if(usedCaptchaKeys[captchaKey] !== undefined){
                        if(!ws.closed) ws.close();
                        return;
                    }
                    
                    // Player metadata will be set by the client after captcha
                    // For now, use default values until player sends their info
                    if(!playerMetadata.has(ws.id)){
                        playerMetadata.set(ws.id, {
                            name: teamToName(ws.id),
                            color: teamToColor(ws.id),
                            kingX: 0,
                            kingY: 0
                        });
                    }
                    
                    // Verify captcha
                    try {
                        const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
                            method: 'POST',
                            headers: { "Content-Type": "application/x-www-form-urlencoded" },
                            body: `secret=${captchaSecretKey}&response=${captchaKey}`,
                        });
                        
                        const result = await response.json();
                        
                        if(result.success){
                            ws.verified = true;
                            usedCaptchaKeys[captchaKey] = Date.now();
                        } else {
                            if(!ws.closed) ws.close();
                            return;
                        }
                    } catch(e){
                        console.error('Captcha verification failed:', e);
                        if(!ws.closed) ws.close();
                        return;
                    }
                }
                
                if(Date.now() < ws.respawnTime) return;
                
                // Spawn king
                const spawn = findSpawnLocation();
                setSquare(spawn.x, spawn.y, 6, ws.id);
                
                const meta = playerMetadata.get(ws.id);
                if(meta){
                    meta.kingX = spawn.x;
                    meta.kingY = spawn.y;
                }
                
                ws.verified = true;
                ws.dead = false;
                
                // Send initial viewport
                sendViewportState(ws, spawn.x, spawn.y);
                ws.camera.x = spawn.x;
                ws.camera.y = spawn.y;
            })();
            return;
        }
        
        if(data.byteLength % 2 !== 0) return;
        const decoded = new Uint16Array(data);
        
        // Chat message
        if(decoded[0] === 47095){
            if(data.byteLength > 1000) return;
            
            const now = Date.now();
            if(now - ws.lastChat5sTime > 10000){
                ws.chatMsgsLast5s = 0;
                ws.lastChat5sTime = now;
            }
            
            ws.chatMsgsLast5s++;
            if(ws.chatMsgsLast5s > 3){
                let chatMessage = '[Server] Spam detected. You cannot send messages for up to 10s.';
                if(chatMessage.length % 2 === 1) chatMessage += ' ';
                
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
            if(txt.length > 64) return;
            
            let chatMessage = txt;
            let id = ws.id;
            
            if(isBadWord(chatMessage)) return;
            
            if(chatMessage.slice(0, 7) === '/announce'){
                chatMessage = '[SERVER] ' + chatMessage.slice(8);
                id = 65534;
            }
            
            if(chatMessage.length % 2 === 1) chatMessage += ' ';
            
            const buf = new Uint8Array(chatMessage.length + 4);
            const u16 = new Uint16Array(buf.buffer);
            buf[0] = 247;
            buf[1] = 183;
            u16[1] = id;
            encodeAtPosition(chatMessage, buf, 4);
            broadcastToAll(buf);
        }
        
        // Move piece
        else if(data.byteLength === 8){
            const now = Date.now();
            if(now - ws.lastMovedTime < moveCooldown - 500) return;
            
            const startX = decoded[0];
            const startY = decoded[1];
            const finX = decoded[2];
            const finY = decoded[3];
            
            const startPiece = spatialHash.get(startX, startY);
            
            // Validate ownership
            if(startPiece.team !== ws.id) return;
            
            // Validate move legality
            const legalMoves = generateLegalMoves(startX, startY, spatialHash, ws.id);
            
            let isLegal = false;
            for(const [mx, my] of legalMoves){
                if(mx === finX && my === finY){
                    isLegal = true;
                    break;
                }
            }
            
            if(!isLegal) return;
            
            move(startX, startY, finX, finY, ws.id);
            ws.lastMovedTime = now;
        }
    },
    
    close: (ws) => {
        delete clients[ws.id];
        ws.closed = true;
        
        if(ws.id) teamsToNeutralize.push(ws.id);
        
        if(leaderboard.has(ws.id)){
            leaderboard.delete(ws.id);
            broadcastToAll(sendLeaderboard());
        }
        
        playerMetadata.delete(ws.id);
        
        if(ws.ip) delete connectedIps[ws.ip];
    },
    
    upgrade: (res, req, context) => {
        let ip = getIp(res, req);
        
        if(ip !== undefined){
            if(connectedIps[ip] === true){
                res.end("Connection rejected");
                console.log('ws ratelimit', ip);
                return;
            }
            connectedIps[ip] = true;
        }
        
        res.upgrade(
            { ip },
            req.getHeader('sec-websocket-key'),
            req.getHeader('sec-websocket-protocol'),
            req.getHeader('sec-websocket-extensions'),
            context
        );
    },
}).listen(PORT, (token) => {
    if(token){
        console.log('Server Listening to Port ' + PORT);
    } else {
        console.log('Failed to Listen to Port ' + PORT);
    }
});

function getIp(res, req) {
    let forwardedIp = req.getHeader('cf-connecting-ip') || 
        req.getHeader('x-forwarded-for') || 
        req.getHeader('x-real-ip');
    
    if(forwardedIp){
        return forwardedIp.split(',')[0].trim();
    }
    
    let rawIp = new TextDecoder().decode(res.getRemoteAddressAsText());
    
    if(rawIp.startsWith('::ffff:')){
        return rawIp.substring(7);
    }
    
    return rawIp;
}

global.send = (ws, msg) => {
    if(!ws.closed) ws.send(msg, true, false);
};

// HTTP handlers
let servedIps = {};
setInterval(() => {
    servedIps = {};
    global.fileServedIps = {};
}, 20 * 1000);

app.get("/", (res, req) => {
    const ip = getIp(res, req);
    if(servedIps[ip] === undefined) servedIps[ip] = 0;
    
    if(servedIps[ip] > 3 && isProd === true){
        res.end('ratelimit. Try again in 20 seconds.');
        console.log('main site ratelimit from', ip);
        return;
    }
    servedIps[ip]++;
    
    res.end(fs.readFileSync('client/index.html'));
});

global.fileServedIps = {};

app.get("/:filename/:filename2", (res, req) => {
    const ip = getIp(res, req);
    if(fileServedIps[ip] === undefined) fileServedIps[ip] = 0;
    fileServedIps[ip]++;
    
    if(fileServedIps[ip] > 25 && isProd === true){
        res.end('ratelimit. try again in 20 seconds.');
        console.log('file ratelimit', ip);
        return;
    }
    
    if(req.getParameter(0) === 'server'){
        res.cork(() => res.end());
        return;
    }
    
    let path = req.getParameter(0) + '/' + req.getParameter(1);
    if(fs.existsSync(path) && fs.statSync(path).isFile()){
        const pathEnd = path.slice(path.length - 3);
        if(pathEnd === 'css') res.writeHeader("Content-Type", "text/css");
        else res.writeHeader("Content-Type", "text/javascript");
        res.end(fs.readFileSync(path));
    } else {
        res.cork(() => {
            res.writeStatus('404 Not Found');
            res.end();
        });
    }
});

app.get("/client/assets/:filename", (res, req) => {
    const ip = getIp(res, req);
    if(fileServedIps[ip] === undefined) fileServedIps[ip] = 0;
    fileServedIps[ip]++;
    
    if(fileServedIps[ip] > 25 && isProd === true){
        res.end('ratelimit. try again in 20 seconds.');
        console.log('asset file ratelimit', ip);
        return;
    }
    
    let path = 'client/assets/' + req.getParameter(0);
    if(fs.existsSync(path) && fs.statSync(path).isFile()){
        const pathEnd = path.slice(path.length - 3);
        if(pathEnd === 'png') res.writeHeader("Content-Type", "image/png");
        else res.writeHeader("Content-Type", "audio/mpeg");
        res.end(fs.readFileSync(path));
    } else {
        res.cork(() => {
            res.writeStatus('404 Not Found');
            res.end();
        });
    }
});

// Bad word filter
const alphabet = 'abcdefghijklmnopqrstuvwxyz';
const alphabetMap = {};
for(let i = 0; i < alphabet.length; i++){
    alphabetMap[alphabet[i]] = true;
}

function isBadWord(str){
    let filtered = '';
    for(let i = 0; i < str.length; i++){
        const char = str[i].toLowerCase();
        if(alphabetMap[char]) filtered += char;
    }
    
    for(const word of badWords){
        if(filtered.includes(word)){
            console.log('bad word', word, filtered);
            return true;
        }
    }
    return false;
}

const encoder = new TextEncoder();
function encodeAtPosition(string, u8array, position) {
    return encoder.encodeInto(string, position ? u8array.subarray(position | 0) : u8array);
}
