let ws = new WebSocket(HOST);
ws.binaryType = "arraybuffer";

window.selfId = -1;
window.playerName = '';
window.playerColor = '#FF0000';

// Spatial hash on client side
const spatialHash = new SpatialHash();
window.spatialHash = spatialHash;

// Store for interpolating piece movements
let interpolatingPieces = {};

// Active chat bubbles
const activeChatBubbles = new Map(); // playerId -> { text, time, element }

ws.addEventListener("message", function (data) {
    const msg = new Uint16Array(data.data);
    const u8 = new Uint8Array(data.data);
    
    // Viewport sync (initial or periodic update)
    if (msg[0] === 55553) {
        selfId = msg[1];
        const count = msg[2];
        
        // Clear and repopulate spatial hash with viewport pieces
        spatialHash.chunks.clear();
        spatialHash.pieceCount = 0;
        
        let i = 3;
        for (let j = 0; j < count; j++) {
            const x = msg[i++];
            const y = msg[i++];
            const type = msg[i++];
            const team = msg[i++];
            spatialHash.set(x, y, type, team);
        }
        
        // Show chat UI after first sync
        document.querySelector('.chatContainer').classList.remove('hidden');
        
        changed = true;
        return;
    }
    
    // Set square (single piece update)
    else if (msg[0] === 55555 && msg.byteLength === 10) {
        const x = msg[1];
        const y = msg[2];
        const piece = msg[3];
        const team = msg[4];
        
        spatialHash.set(x, y, piece, team);
        
        if (piece === 6 && team === selfId) {
            gameOver = false;
            gameOverTime = undefined;
            interpSquare = [x, y];
            setTimeout(() => {
                if (gameOver === false) interpSquare = undefined;
            }, 1200);
        }
        
        changed = true;
        return;
    }
    
    // Move piece
    else if (msg[0] === 55554 && msg.byteLength === 12) {
        const startX = msg[1];
        const startY = msg[2];
        const finX = msg[3];
        const finY = msg[4];
        const playerId = msg[5];
        
        const movingPiece = spatialHash.get(startX, startY);
        const endPiece = spatialHash.get(finX, finY);
        
        // Play sounds
        if (audioLoaded === true && playerId === selfId) {
            try {
                if (endPiece.type !== 0) {
                    audios.capture[Math.random() < 0.5 ? 1 : 0].play();
                } else {
                    audios.move[Math.random() < 0.5 ? 0 : 1].play();
                }
            } catch(e) {}
        }
        
        // Check if our king was captured
        if (movingPiece.type === 6 && endPiece.type === 6 && endPiece.team === selfId) {
            interpSquare = [finX, finY];
            gameOver = true;
            gameOverTime = time;
            
            try {
                audios.gameover[0].play();
            } catch(e) {}
            
            setTimeout(() => {
                const buf = new Uint8Array(0);
                send(buf);
            }, respawnTime - 100);
        }
        
        // Update spatial hash
        spatialHash.set(finX, finY, movingPiece.type, movingPiece.team);
        spatialHash.set(startX, startY, 0, 0);
        
        // Set up interpolation for smooth movement
        if (playerId !== selfId || !moveWasDrag) {
            if (!interpolatingPieces[finX]) interpolatingPieces[finX] = {};
            interpolatingPieces[finX][finY] = [startX, startY];
        }
        
        // Clear selection if our piece moved
        if (movingPiece.team === selfId) {
            if (selectedSquareX === startX && selectedSquareY === startY) {
                unconfirmedSX = unconfirmedSY = selectedSquareX = selectedSquareY = undefined;
                legalMoves = undefined;
                draggingSelected = false;
                moveWasDrag = false;
            }
            curMoveCooldown = window.moveCooldown;
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
                if (piece.type === 6) {
                    spatialHash.set(piece.x, piece.y, 0, 0);
                } else {
                    spatialHash.set(piece.x, piece.y, piece.type, 0);
                }
            }
        }
        
        changed = true;
        return;
    }
    
    // Chat message
    else if (msg[0] === 47095) {
        const playerId = msg[1];
        const txt = stringHTMLSafe(decodeText(u8, 4)).replaceAll('&nbsp;', ' ');
        
        // Add to chat log
        if (playerId !== 65534) {
            const color = teamToColor(playerId);
            appendChatMessage(txt, `rgb(${color.r},${color.g},${color.b})`);
            
            // Show floating bubble
            showChatBubble(playerId, txt);
        } else {
            appendChatMessage(txt, 'rainbow');
        }
        return;
    }
    
    // Leaderboard
    else if (msg[0] === 48027) {
        const prevLB = document.querySelector('.lb-group');
        if (prevLB) {
            const toRemove = prevLB.querySelectorAll('.lb-players');
            for (let i = 0; i < toRemove.length; i++) {
                toRemove[i].remove();
            }
        }
        
        let i = 1;
        const arr = [];
        
        while (i < msg.length - 1) {
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
        
        for (let i = 0; i < arr.length; i++) {
            const { name, id, kills, color } = arr[i];
            addToLeaderboard(name, id, "Leaderboard", kills, `rgb(${color.r},${color.g},${color.b})`);
        }
        return;
    }
});

let connected = false;
window.send = () => {};

const msgs = [];
window.send = (data) => {
    msgs.push(data);
};

ws.onopen = () => {
    connected = true;
    window.send = (data) => {
        ws.send(data);
    };
    
    for (let i = 0; i < msgs.length; i++) {
        window.send(msgs[i]);
    }
    msgs.length = 0;
};

ws.onclose = () => {
    connected = false;
    console.log('Disconnected from server');
    // Only show alert if we were previously connected (not on initial failed connection)
    if (selfId !== -1) {
        setTimeout(() => {
            if (!connected) {
                alert('Disconnected from server!');
            }
        }, 1000);
    }
    window.send = () => {};
};

// Send camera position periodically for viewport syncing
setInterval(() => {
    if (connected && camera) {
        const buf = new Int16Array(4);
        buf[0] = 55552; // Magic number for camera update
        buf[1] = Math.floor(camera.x);
        buf[2] = Math.floor(camera.y);
        buf[3] = Math.floor(camera.scale * 100); // Scale as integer
        send(buf.buffer);
    }
}, 500);

// Player setup modal
let captchaCompleted = false;
let playerSetupCompleted = false;

function initPlayerSetup() {
    const nameInput = document.getElementById('playerName');
    const colorOptions = document.querySelectorAll('.color-option');
    const startBtn = document.getElementById('startGameBtn');
    const previewCanvas = document.getElementById('previewCanvas');
    const previewName = document.getElementById('previewName');
    const previewCtx = previewCanvas.getContext('2d');
    
    // Color selection
    colorOptions.forEach(option => {
        option.addEventListener('click', () => {
            colorOptions.forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');
            playerColor = option.dataset.color;
            updatePreview();
        });
    });
    
    // Name input
    nameInput.addEventListener('input', () => {
        playerName = nameInput.value.trim();
        updatePreview();
    });
    
    // Update preview
    function updatePreview() {
        previewName.textContent = playerName || 'Your Name';
        
        // Draw king piece with selected color
        previewCtx.clearRect(0, 0, 150, 150);
        
        // Background
        previewCtx.fillStyle = '#739552';
        previewCtx.fillRect(0, 0, 150, 150);
        
        // Draw king (simplified representation)
        const color = hexToRgb(playerColor);
        previewCtx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
        
        // Draw crown shape
        previewCtx.beginPath();
        previewCtx.moveTo(30, 100);
        previewCtx.lineTo(40, 60);
        previewCtx.lineTo(55, 80);
        previewCtx.lineTo(75, 40);
        previewCtx.lineTo(95, 80);
        previewCtx.lineTo(110, 60);
        previewCtx.lineTo(120, 100);
        previewCtx.closePath();
        previewCtx.fill();
        
        // Cross on top
        previewCtx.fillRect(70, 20, 10, 30);
        previewCtx.fillRect(60, 30, 30, 10);
    }
    
    // Start button
    startBtn.addEventListener('click', () => {
        if (!playerName) {
            playerName = 'Player ' + Math.floor(Math.random() * 9999);
        }
        
        playerSetupCompleted = true;
        document.getElementById('playerSetupDiv').classList.add('hidden');
        
        // Send player info to server
        sendPlayerInfo();
    });
    
    // Initial preview
    updatePreview();
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 255, g: 0, b: 0 };
}

function sendPlayerInfo() {
    if (!connected) return;
    
    // Send player info: name (string) + color (3 bytes)
    const nameBuf = new TextEncoder().encode(playerName);
    const buf = new Uint8Array(4 + nameBuf.length + 3);
    
    buf[0] = 55551; // Magic number for player info
    buf[1] = nameBuf.length;
    
    const color = hexToRgb(playerColor);
    buf[2] = color.r;
    buf[3] = color.g;
    buf[4] = color.b;
    
    // Copy name
    for (let i = 0; i < nameBuf.length; i++) {
        buf[5 + i] = nameBuf[i];
    }
    
    send(buf);
}

// Floating chat bubbles
function showChatBubble(playerId, text) {
    // Find player's king piece
    const pieces = spatialHash.getAllPieces();
    let kingPiece = null;
    
    for (const piece of pieces) {
        if (piece.type === 6 && piece.team === playerId) {
            kingPiece = piece;
            break;
        }
    }
    
    if (!kingPiece) return;
    
    // Create bubble element
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    bubble.textContent = text.substring(0, 32); // Max 32 chars
    document.body.appendChild(bubble);
    
    // Store bubble data
    const bubbleData = {
        text: text,
        time: Date.now(),
        element: bubble,
        pieceX: kingPiece.x,
        pieceY: kingPiece.y,
        playerId: playerId
    };
    
    activeChatBubbles.set(playerId, bubbleData);
    
    // Remove after 5 seconds
    setTimeout(() => {
        if (activeChatBubbles.has(playerId)) {
            const data = activeChatBubbles.get(playerId);
            if (data.element === bubble) {
                bubble.classList.add('fading');
                setTimeout(() => {
                    bubble.remove();
                    activeChatBubbles.delete(playerId);
                }, 500);
            }
        }
    }, 5000);
}

// Update bubble positions in render loop
window.updateChatBubbles = function() {
    activeChatBubbles.forEach((data, playerId) => {
        // Update piece position (in case king moved)
        const pieces = spatialHash.getAllPieces();
        for (const piece of pieces) {
            if (piece.type === 6 && piece.team === playerId) {
                data.pieceX = piece.x;
                data.pieceY = piece.y;
                break;
            }
        }
        
        // Calculate screen position
        const t = ctx.getTransform();
        ctx.translate(canvas.w/2, canvas.h/2);
        ctx.scale(camera.scale, camera.scale);
        ctx.translate(camera.x, camera.y);
        
        const screenPos = canvasPos({
            x: data.pieceX * squareSize + squareSize / 2,
            y: data.pieceY * squareSize - 20
        });
        
        ctx.setTransform(t);
        
        // Update bubble position
        data.element.style.left = screenPos.x + 'px';
        data.element.style.top = screenPos.y + 'px';
        
        // Check if off-screen
        if (screenPos.x < 0 || screenPos.x > canvas.w || 
            screenPos.y < 0 || screenPos.y > canvas.h) {
            data.element.style.display = 'none';
        } else {
            data.element.style.display = 'block';
        }
    });
};

// Join game with captcha
grecaptcha.ready(() => {
    grecaptcha.render(document.querySelector(".g-recaptcha"), {
        'sitekey': '0x4AAAAAABDl4Wthv8-PLPyU',
        'callback': (captchaResponse) => {
            captchaCompleted = true;
            
            // Wait for WebSocket to be open before sending
            const sendCaptcha = () => {
                if (ws.readyState === WebSocket.OPEN) {
                    const buf = new Uint8Array(captchaResponse.length);
                    encodeAtPosition(captchaResponse, buf, 0);
                    ws.send(buf);
                    
                    document.getElementById('fullscreenDiv').classList.add('hidden');
                    
                    // Show player setup modal
                    document.getElementById('playerSetupDiv').classList.remove('hidden');
                    initPlayerSetup();
                } else {
                    // Retry after 100ms if not open yet
                    setTimeout(sendCaptcha, 100);
                }
            };
            
            sendCaptcha();
        }
    });
});

const encoder = new TextEncoder();
function encodeAtPosition(string, u8array, position) {
    return encoder.encodeInto(string, position ? u8array.subarray(position | 0) : u8array);
}

window.stringHTMLSafe = (str) => {
    return str.replace(/&/g, '&amp;')
        .replace(/ /g, '&nbsp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
};

const decoder = new TextDecoder();
function decodeText(u8array, startPos = 0, endPos = Infinity) {
    return decoder.decode(u8array).slice(startPos, endPos);
}

window.addChatMessage = (message, type) => {
    const div = document.createElement('div');
    if (type !== 'system') div.classList.add('chat-message');
    else div.classList.add('system-message');

    const chatPrefixMap = {
        normal: '',
        system: '<span class="rainbow">[SERVER]</span>',
        dev: '<span class="rainbow">[DEV]</span>',
        guest: '<span class="guest">'
    };

    const chatSuffixMap = {
        normal: '',
        system: '',
        dev: '',
        guest: '</span>'
    };

    div.innerHTML = chatPrefixMap[type] + message + chatSuffixMap[type];
    const chatMessageDiv = document.querySelector('.chat-div');
    chatMessageDiv.appendChild(div);
    chatMessageDiv.scrollTop = chatMessageDiv.scrollHeight;
};
