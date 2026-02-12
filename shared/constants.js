// Spatial Hash Configuration
const CHUNK_SIZE = 64;

// Piece Types
const PIECE_EMPTY = 0;
const PIECE_PAWN = 1;
const PIECE_KNIGHT = 2;
const PIECE_BISHOP = 3;
const PIECE_ROOK = 4;
const PIECE_QUEEN = 5;
const PIECE_KING = 6;

// Game Constants
globalThis.moveCooldown = 1.5 * 1000;
globalThis.respawnTime = 5 * 1000;
globalThis.SPAWN_IMMUNITY_MS = 3 * 1000;
globalThis.CHUNK_SIZE = CHUNK_SIZE;

// Utility: Get chunk key from coordinates
globalThis.getChunkKey = (x, y) => {
    const chunkX = Math.floor(x / CHUNK_SIZE);
    const chunkY = Math.floor(y / CHUNK_SIZE);
    return `${chunkX},${chunkY}`;
};

// Utility: Get coordinates from chunk key
globalThis.parseChunkKey = (key) => {
    const [chunkX, chunkY] = key.split(',').map(Number);
    return { chunkX, chunkY };
};

// Seeded RNG for procedural generation
globalThis.seededRandom = (seed) => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
};

// Procedural piece generation
globalThis.getProceduralPiece = (x, y) => {
    const seed = x * 100000 + y;
    const noise = seededRandom(seed);
    
    // 0.2% chance of piece at any coordinate
    if (noise > 0.002) return PIECE_EMPTY;
    
    // Determine piece type
    const typeNoise = seededRandom(seed + 1);
    if (typeNoise < 0.70) return PIECE_PAWN;      // 70%
    if (typeNoise < 0.85) return PIECE_KNIGHT;    // 15%
    if (typeNoise < 0.95) return PIECE_BISHOP;    // 10%
    if (typeNoise < 0.99) return PIECE_ROOK;      // 4%
    return PIECE_QUEEN;                            // 1%
};

// Spatial Hash class
globalThis.SpatialHash = class SpatialHash {
    constructor() {
        this.chunks = new Map(); // key: "chunkX,chunkY", value: Map of "x,y" -> piece
        this.pieceCount = 0;
    }
    
    // Get or create chunk
    getChunk(x, y, create = false) {
        const key = getChunkKey(x, y);
        if (!this.chunks.has(key)) {
            if (!create) return null;
            this.chunks.set(key, new Map());
        }
        return this.chunks.get(key);
    }
    
    // Get piece at position
    get(x, y) {
        const chunk = this.getChunk(x, y, false);
        if (!chunk) return { type: PIECE_EMPTY, team: 0 };
        const piece = chunk.get(`${x},${y}`);
        return piece || { type: PIECE_EMPTY, team: 0 };
    }
    
    // Set piece at position
    set(x, y, type, team) {
        const chunk = this.getChunk(x, y, true);
        const key = `${x},${y}`;
        
        if (type === PIECE_EMPTY) {
            if (chunk.has(key)) {
                chunk.delete(key);
                this.pieceCount--;
                // Clean up empty chunks
                if (chunk.size === 0) {
                    this.chunks.delete(getChunkKey(x, y));
                }
            }
        } else {
            if (!chunk.has(key)) {
                this.pieceCount++;
            }
            chunk.set(key, { type, team, x, y });
        }
    }
    
    // Check if position has piece
    has(x, y) {
        const chunk = this.getChunk(x, y, false);
        if (!chunk) return false;
        return chunk.has(`${x},${y}`);
    }
    
    // Get team at position
    getTeam(x, y) {
        const piece = this.get(x, y);
        return piece.team;
    }
    
    // Query all pieces in radius
    queryRadius(centerX, centerY, radius) {
        const results = [];
        const radiusSquared = radius * radius;
        
        // Calculate chunk bounds
        const minChunkX = Math.floor((centerX - radius) / CHUNK_SIZE);
        const maxChunkX = Math.floor((centerX + radius) / CHUNK_SIZE);
        const minChunkY = Math.floor((centerY - radius) / CHUNK_SIZE);
        const maxChunkY = Math.floor((centerY + radius) / CHUNK_SIZE);
        
        // Iterate through relevant chunks
        for (let cx = minChunkX; cx <= maxChunkX; cx++) {
            for (let cy = minChunkY; cy <= maxChunkY; cy++) {
                const chunk = this.getChunk(cx * CHUNK_SIZE, cy * CHUNK_SIZE, false);
                if (!chunk) continue;
                
                for (const piece of chunk.values()) {
                    const dx = piece.x - centerX;
                    const dy = piece.y - centerY;
                    if (dx * dx + dy * dy <= radiusSquared) {
                        results.push(piece);
                    }
                }
            }
        }
        
        return results;
    }
    
    // Query all pieces in rectangle
    queryRect(minX, minY, maxX, maxY) {
        const results = [];
        
        const minChunkX = Math.floor(minX / CHUNK_SIZE);
        const maxChunkX = Math.floor(maxX / CHUNK_SIZE);
        const minChunkY = Math.floor(minY / CHUNK_SIZE);
        const maxChunkY = Math.floor(maxY / CHUNK_SIZE);
        
        for (let cx = minChunkX; cx <= maxChunkX; cx++) {
            for (let cy = minChunkY; cy <= maxChunkY; cy++) {
                const chunk = this.getChunk(cx * CHUNK_SIZE, cy * CHUNK_SIZE, false);
                if (!chunk) continue;
                
                for (const piece of chunk.values()) {
                    if (piece.x >= minX && piece.x <= maxX && 
                        piece.y >= minY && piece.y <= maxY) {
                        results.push(piece);
                    }
                }
            }
        }
        
        return results;
    }
    
    // Get total piece count
    count() {
        return this.pieceCount;
    }
    
    // Get all pieces (for migration/debugging)
    getAllPieces() {
        const all = [];
        for (const chunk of this.chunks.values()) {
            for (const piece of chunk.values()) {
                all.push(piece);
            }
        }
        return all;
    }
};

// Move range scales with captures: base 3 + 1 per kill, capped at 22
const MOVE_RANGE_BASE = 3;
const MOVE_RANGE_PER_KILL = 1;
const MOVE_RANGE_CAP = 22;
globalThis.MOVE_RANGE_BASE = MOVE_RANGE_BASE;
globalThis.MOVE_RANGE_PER_KILL = MOVE_RANGE_PER_KILL;
globalThis.MOVE_RANGE_CAP = MOVE_RANGE_CAP;

globalThis.getMoveRange = (kills) => {
    return Math.min(MOVE_RANGE_CAP, MOVE_RANGE_BASE + (kills || 0) * MOVE_RANGE_PER_KILL);
};

// Legacy: Generate legal moves (updated for spatial hash)
globalThis.generateLegalMoves = (x, y, spatialHash, selfId, kills) => {
    const piece = spatialHash.get(x, y);
    const type = piece.type;
    if (type === PIECE_EMPTY) return [];
    
    const range = getMoveRange(kills);
    return moveMap[type](x, y, spatialHash, selfId, range);
};

// Helper for straight line moves
globalThis.getAllStraightLineMoves = (moves, x, y, xInc, yInc, spatialHash, selfId, maxRange = 22) => {
    let curX = x + xInc;
    let curY = y + yInc;
    for (let i = 0; i < maxRange; i++) {
        const piece = spatialHash.get(curX, curY);
        
        // If we hit a wall/own piece, break
        if (piece.team === selfId) break;
        
        moves.push([curX, curY]);
        
        // If this move was a capture, break
        if (piece.type !== PIECE_EMPTY) break;
        
        curX += xInc;
        curY += yInc;
    }
};

// Move definitions (updated for spatial hash)
const moveMap = [
    undefined, // 0 = empty
    
    // 1 = pawn
    (x, y, spatialHash, selfId, range) => {
        const moves = [];
        
        // Orthogonal moves
        const orthogonal = [[x+1,y], [x-1,y], [x,y+1], [x,y-1]];
        for (const [mx, my] of orthogonal) {
            const piece = spatialHash.get(mx, my);
            if (piece.team !== selfId) {
                moves.push([mx, my]);
            }
        }
        
        // Diagonal captures (must have piece)
        const diagonals = [[x+1,y+1], [x+1,y-1], [x-1,y+1], [x-1,y-1]];
        for (const [mx, my] of diagonals) {
            const piece = spatialHash.get(mx, my);
            if (piece.team !== selfId && piece.type !== PIECE_EMPTY) {
                moves.push([mx, my]);
            }
        }
        
        return moves;
    },
    
    // 2 = knight
    (x, y, spatialHash, selfId, range) => {
        const knightMoves = [
            [x+1,y+2], [x+2,y+1], [x+2,y-1], [x+1,y-2],
            [x-1,y-2], [x-2,y-1], [x-2,y+1], [x-1,y+2]
        ];
        return knightMoves.filter(([mx, my]) => {
            const piece = spatialHash.get(mx, my);
            return piece.team !== selfId;
        });
    },
    
    // 3 = bishop
    (x, y, spatialHash, selfId, range) => {
        const moves = [];
        getAllStraightLineMoves(moves, x, y, 1, 1, spatialHash, selfId, range);
        getAllStraightLineMoves(moves, x, y, 1, -1, spatialHash, selfId, range);
        getAllStraightLineMoves(moves, x, y, -1, 1, spatialHash, selfId, range);
        getAllStraightLineMoves(moves, x, y, -1, -1, spatialHash, selfId, range);
        return moves;
    },
    
    // 4 = rook
    (x, y, spatialHash, selfId, range) => {
        const moves = [];
        getAllStraightLineMoves(moves, x, y, 1, 0, spatialHash, selfId, range);
        getAllStraightLineMoves(moves, x, y, 0, 1, spatialHash, selfId, range);
        getAllStraightLineMoves(moves, x, y, -1, 0, spatialHash, selfId, range);
        getAllStraightLineMoves(moves, x, y, 0, -1, spatialHash, selfId, range);
        return moves;
    },
    
    // 5 = queen
    (x, y, spatialHash, selfId, range) => {
        const moves = [];
        getAllStraightLineMoves(moves, x, y, 1, 1, spatialHash, selfId, range);
        getAllStraightLineMoves(moves, x, y, 1, -1, spatialHash, selfId, range);
        getAllStraightLineMoves(moves, x, y, -1, 1, spatialHash, selfId, range);
        getAllStraightLineMoves(moves, x, y, -1, -1, spatialHash, selfId, range);
        getAllStraightLineMoves(moves, x, y, 1, 0, spatialHash, selfId, range);
        getAllStraightLineMoves(moves, x, y, 0, 1, spatialHash, selfId, range);
        getAllStraightLineMoves(moves, x, y, -1, 0, spatialHash, selfId, range);
        getAllStraightLineMoves(moves, x, y, 0, -1, spatialHash, selfId, range);
        return moves;
    },
    
    // 6 = king
    (x, y, spatialHash, selfId, range) => {
        const kingMoves = [
            [x+1,y], [x-1,y], [x,y+1], [x,y-1],
            [x+1,y+1], [x+1,y-1], [x-1,y+1], [x-1,y-1]
        ];
        return kingMoves.filter(([mx, my]) => {
            const piece = spatialHash.get(mx, my);
            return piece.team !== selfId;
        });
    },
];

// Chess notation for 64x64 board
// Columns: a-z (0-25), 2a-2z (26-51), 3a-3l (52-63)
// Rows: 64 (y=0, top) down to 1 (y=63, bottom) — chess convention
globalThis.colToNotation = (col) => {
    const letter = String.fromCharCode(97 + (col % 26));
    const prefix = Math.floor(col / 26);
    return prefix === 0 ? letter : `${prefix + 1}${letter}`;
};

globalThis.rowToNotation = (row) => {
    return String(64 - row);
};

globalThis.toChessNotation = (x, y) => {
    return colToNotation(x) + rowToNotation(y);
};

globalThis.PIECE_NAMES = ['', 'Pawn', 'Knight', 'Bishop', 'Rook', 'Queen', 'King'];
globalThis.PIECE_SYMBOLS = ['', '', 'N', 'B', 'R', 'Q', 'K'];

globalThis.moveToNotation = (pieceType, fromX, fromY, toX, toY, isCapture) => {
    const symbol = PIECE_SYMBOLS[pieceType] || '';
    const from = toChessNotation(fromX, fromY);
    const to = toChessNotation(toX, toY);
    const cap = isCapture ? 'x' : '-';
    return `${symbol}${from}${cap}${to}`;
};

// Utility: Array random
globalThis.Array.prototype.random = function() {
    return this[Math.floor(Math.random() * this.length)];
};

// Bad word filter
const BAD_WORDS = [
  'ass', 'bitch', 'damn', 'fuck', 'shit', 'crap', 'piss', 'cock', 'dick',
  'pussy', 'whore', 'slut', 'bastard', 'asshole', 'douchebag', 'motherfucker',
  'nigger', 'nigga', 'faggot', 'retard', 'kys', 'kms', 'kill yourself'
];

globalThis.filterBadWords = (text) => {
  if (!text) return text;
  let filtered = text.toLowerCase();
  for (const word of BAD_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    filtered = filtered.replace(regex, '*'.repeat(word.length));
  }
  return filtered;
};

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SpatialHash, getChunkKey, parseChunkKey, getProceduralPiece };
}
