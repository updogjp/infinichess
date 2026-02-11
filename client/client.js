const HOST = location.origin.replace(/^http/, 'ws');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Spatial hash is now defined in networking.js
// window.spatialHash is available

let mouse, lastRenderedMinimap = -1E5;
let selectedSquareX, selectedSquareY;
let legalMoves = [], draggingSelected = false, moveWasDrag = false;
let curMoveCooldown = 0;

window.onmousemove = (e) => {
    if(isMobile && dragging === true){
        let mouseCoords = canvasPos({x: e.x, y: e.y});
        dist = Math.min(stickR, Math.sqrt((mouseCoords.x - coords.x) ** 2 + (mouseCoords.y - coords.y) ** 2));
        angle = Math.atan2(mouseCoords.y - coords.y, mouseCoords.x - coords.x);
        changed = true;
        mouse = e;
        return;
    }
    
    mouse = e;
    if(selectedSquareX !== undefined){
        changed = true;
    }
}

window.oncontextmenu = (e) => {
    return e.preventDefault();
}

window.onmousedown = (e) => {
    const t = ctx.getTransform();

    ctx.translate(canvas.w/2, canvas.h/2);
    ctx.scale(camera.scale, camera.scale);
    ctx.translate(camera.x, camera.y);

    mousePos = canvasPos({x: e.x, y: e.y});

    ctx.setTransform(t);

    if(isMobile === true){
        let mouseCoords = canvasPos({x: e.x, y: e.y});

        for(let i = 0; i < buttons.length; i++){
            const {clicking, xPercent, yPercent, rPercent, text} = buttons[i];
            const coords = {x: xPercent * innerWidth, y: yPercent * innerHeight};
            let mag = Math.sqrt((mouseCoords.x - coords.x) ** 2 + (mouseCoords.y - coords.y) ** 2);
            if(mag <= rPercent * innerHeight){
                buttons[i].clicking = true;
                changed = true;
                return;
            }
        }

        let mag = Math.sqrt((mouseCoords.x - coords.x) ** 2 + (mouseCoords.y - coords.y) ** 2);
        dist = Math.min(stickR, mag);
        angle = Math.atan2(mouseCoords.y - coords.y, mouseCoords.x - coords.x);
        if(mag <= stickR){
            dragging = true;
            changed = true;
            return;
        } else {
            if(dist !== 0 || angle !== 0) changed = true;
            dist = angle = 0;
        }
    }

    const squareX = Math.floor(mousePos.x / squareSize);
    const squareY = Math.floor(mousePos.y / squareSize);

    if(legalMoves !== undefined && selectedSquareX !== undefined){
        for(let i = 0; i < legalMoves.length; i++){
            if(legalMoves[i][0] === squareX && legalMoves[i][1] === squareY && curMoveCooldown <= 220){
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
                return;
            }
        }
    }
    selectedSquareX = selectedSquareY = undefined;
    legalMoves = undefined;

    // Check if clicking on own piece
    if(spatialHash){
        const piece = spatialHash.get(squareX, squareY);
        if(piece.type !== 0 && piece.team === selfId){
            selectedSquareX = squareX;
            selectedSquareY = squareY;

            legalMoves = generateLegalMoves(selectedSquareX, selectedSquareY, spatialHash, selfId);

            draggingSelected = true;
        }
    }
}

let unconfirmedSX, unconfirmedSY;
window.onmouseup = (e) => {
    if(isMobile){
        for(let i = 0; i < buttons.length; i++){
            if(buttons[i].clicking === true) changed = true;
            buttons[i].clicking = false;
        }
    
        if(dragging === true){
            dragging = false;
            dist = angle = 0;
            return;
        }
    }
    
    if(selectedSquareX !== undefined){
        const newX = Math.floor(mousePos.x / squareSize);
        const newY = Math.floor(mousePos.y / squareSize);

        let legal = false;
        for(let i = 0; i < legalMoves.length; i++){
            if(legalMoves[i][0] === newX && legalMoves[i][1] === newY){
                legal = true;
                break;
            }
        }

        if(legal === true && curMoveCooldown <= 220){
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
            return;
        }
    }
    draggingSelected = false;
}

const colors = ['#ebecd0','#739552'];
const squareSize = 150;

// Camera starts at origin
let camera = {x: 0, y: 0, scale: 1};

// 0 - empty
// 1 - pawn
// 2 - knight
// 3 - bishop
// 4 - rook
// 5 - queen
// 6 - king
const srcs = ['wp','wn','wb','wr','wq','wk'];

const imgs = [undefined];
let imgsToLoad = 0, imgsLoaded = false;
for(let i = 0; i < srcs.length; i++){
    imgsToLoad++;
    const img = new Image();
    img.src = `/client/assets/${srcs[i]}.png`;
    img.onload = () => {
        imgsToLoad--;
        if(imgsToLoad === 0){
            imgsLoaded = true;
            requestAnimationFrame(render);
        }
    }
    imgs.push(img);
}

const audioSrcs = ['move1', 'move2', 'capture1', 'capture2', 'gameover'];
let audios = [];
let audiosToLoad = 0, audioLoaded = false;
for(let i = 0; i < audioSrcs.length; i++){
    audiosToLoad++;
    const a = new Audio();
    a.src = `client/assets/${audioSrcs[i]}.mp3`;
    a.oncanplay = () => {
        audiosToLoad--;
        audios[i] = a;
        if(audiosToLoad === 0){
            audioLoaded = true;
            audios = {
                move: [audios[0], audios[1]],
                capture: [audios[2], audios[3]],
                gameover: [audios[4]]
            }
        }
    }
}

const tintedImgs = new Map(); // Use Map for better memory management with LRU
const MAX_TINTED_CACHE = 100;

let time = performance.now();
let lastTime = time;
let dt = 0;
let cooldown = -1;
let mousePos;
let gameOver = false, interpSquare = undefined, gameOverAlpha = 0, gameOverTime;

let minimapCanvas = document.getElementById('minimapCanvas');
let cx = minimapCanvas.getContext('2d');

function render() {
    canvas.w = canvas.width; 
    canvas.h = canvas.height;
    ctx.imageSmoothingEnabled = camera.scale < 2;

    requestAnimationFrame(render);

    time = performance.now();
    dt = time - lastTime;
    if(cooldown > 0) changed = true;
    cooldown -= dt;
    lastTime = time;

    if(!changed && !interpSquare) return;
    changed = false;

    // Clear background
    ctx.fillStyle = '#121212';
    ctx.fillRect(0, 0, canvas.w, canvas.h);

    const t = ctx.getTransform();

    ctx.translate(canvas.w/2, canvas.h/2);
    ctx.scale(camera.scale, camera.scale);
    ctx.translate(camera.x, camera.y);
    
    // Calculate visible range
    let topLeft = canvasPos({x: 0, y: 0});
    let bottomRight = canvasPos({x: innerWidth, y: innerHeight});

    // Convert to grid coordinates
    const startX = Math.floor(topLeft.x / squareSize) - 1;
    const endX = Math.ceil(bottomRight.x / squareSize) + 1;
    const startY = Math.floor(topLeft.y / squareSize) - 1;
    const endY = Math.ceil(bottomRight.y / squareSize) + 1;

    // Render infinite chess board pattern
    ctx.fillStyle = colors[0];
    ctx.fillRect(startX * squareSize, startY * squareSize, 
                 (endX - startX + 2) * squareSize, (endY - startY + 2) * squareSize);

    ctx.fillStyle = colors[1];
    for(let i = startX; i <= endX; i++){
        for(let j = startY; j <= endY; j++){
            if((i + j) % 2 === 0){
                ctx.fillRect(i * squareSize, j * squareSize, squareSize, squareSize);
            }
        }
    }

    // Render legal moves
    if(legalMoves) {
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = 'black';
        for(let i = 0; i < legalMoves.length; i++){
            const [mx, my] = legalMoves[i];
            if(mx < startX || mx > endX || my < startY || my > endY) continue;

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
    if(spatialHash) {
        const visiblePieces = spatialHash.queryRect(startX, startY, endX, endY);
        
        for(const piece of visiblePieces){
            if(piece.type === 0) continue;
            
            if(piece.team === 0){
                // Neutral piece - draw white sprite
                ctx.drawImage(imgs[piece.type], piece.x * squareSize, piece.y * squareSize);
            } else {
                // Player piece - draw tinted sprite
                if(piece.team === selfId){
                    // Highlight own pieces
                    ctx.fillStyle = '#00b400';
                    ctx.globalAlpha = 0.6 + Math.sin(time / 320) * 0.2;
                    ctx.fillRect(piece.x * squareSize, piece.y * squareSize, squareSize, squareSize);
                    ctx.globalAlpha = 1;
                    changed = true;
                }

                const color = teamToColor(piece.team);
                const hash = `${color.r}_${color.g}_${color.b}`;
                
                // Manage cache size
                if(!tintedImgs.has(hash)){
                    if(tintedImgs.size >= MAX_TINTED_CACHE){
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
                
                if(interpolatingPieces && interpolatingPieces[interpKey]){
                    const interp = interpolatingPieces[interpKey];
                    interp[0] = interpolate(interp[0], piece.x, 0.45 * dt / 16.66);
                    interp[1] = interpolate(interp[1], piece.y, 0.45 * dt / 16.66);
                    
                    if(Math.abs(interp[0] - piece.x) < 0.01 && Math.abs(interp[1] - piece.y) < 0.01){
                        delete interpolatingPieces[interpKey];
                    }
                    
                    renderX = interp[0];
                    renderY = interp[1];
                }
                
                ctx.drawImage(tintedArr[piece.type], renderX * squareSize, renderY * squareSize);
            }
        }
    }

    // Dragging selected piece
    if(selectedSquareX !== undefined && draggingSelected === true && spatialHash){
        const piece = spatialHash.get(selectedSquareX, selectedSquareY);
        if(piece.type !== 0){
            // Cover up original square
            if((selectedSquareX + selectedSquareY) % 2 === 0){
                ctx.fillStyle = colors[1];
            } else {
                ctx.fillStyle = colors[0];
            }
            ctx.fillRect(selectedSquareX * squareSize, selectedSquareY * squareSize, squareSize, squareSize);

            // Draw dragged piece at mouse position
            const color = teamToColor(selfId);
            const hash = `${color.r}_${color.g}_${color.b}`;
            
            if(!tintedImgs.has(hash)){
                generateTintedImages(color);
            }
            
            const tintedArr = tintedImgs.get(hash);
            ctx.drawImage(tintedArr[piece.type], mousePos.x - squareSize / 2, mousePos.y - squareSize / 2);
        }
    }

    // Mouse interactions
    if(mouse && spatialHash) {
        mousePos = canvasPos(mouse);

        const squareX = Math.floor(mousePos.x / squareSize);
        const squareY = Math.floor(mousePos.y / squareSize);

        const piece = spatialHash.get(squareX, squareY);
        if(piece.type !== 0 && piece.team === selfId){
            canvas.style.cursor = 'grab';
        } else {
            canvas.style.cursor = '';
        }

        // Move cooldown indicator
        if(curMoveCooldown > 0){
            curMoveCooldown -= dt;
            const percent = Math.max(0, curMoveCooldown / window.moveCooldown);
    
            let xOff = 10 / camera.scale;
            let yOff = -42 / camera.scale;
            const w = 68 / camera.scale;
            const h = 22 / camera.scale;

            ctx.fillStyle = 'black';
            ctx.globalAlpha = Math.min(percent * 4, 0.8);

            const x = xOff + mousePos.x;
            const y = yOff + mousePos.y;

            ctx.fillRect(x + w * percent, y, w * (1 - percent), h);

            const color = teamToColor(selfId);
            ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
            ctx.fillRect(x, y, w * percent, h);

            ctx.globalAlpha = 1;
        }
    }

    ctx.setTransform(t);

    // Minimap (simplified for infinite world)
    renderMinimap();

    // Game over screen
    if(gameOver === true){
        gameOverAlpha = interpolate(gameOverAlpha, 1, dt / 16.66 * 0.1);
        changed = true;

        const y = Math.sin(time / 320) * canvas.h / 16;

        ctx.font = '700 62px monospace';
        ctx.lineWidth = 5;
        ctx.fillStyle = 'white';
        ctx.strokeStyle = 'black';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeText('Game Over!', canvas.w/2, canvas.h/2 + y - 36);
        ctx.fillText('Game Over!', canvas.w/2, canvas.h/2 + y - 36);

        ctx.font = '700 31px monospace';
        ctx.lineWidth = 3;

        const t = (Math.max(0, gameOverTime + respawnTime - time) / 1000).toFixed(1);

        ctx.strokeText(`You Will Respawn in`, canvas.w/2, canvas.h/2 + y + 7);
        ctx.fillText(`You Will Respawn in`, canvas.w/2, canvas.h/2 + y + 7);

        ctx.strokeText(`${t} seconds.`, canvas.w/2, canvas.h/2 + y + 36);
        ctx.fillText(`${t} seconds.`, canvas.w/2, canvas.h/2 + y + 36);
    }

    // Mobile controls
    if(isMobile){
        drawJoystick();
        drawButtons();
    }
    
    // Update floating chat bubbles
    if(window.updateChatBubbles){
        window.updateChatBubbles();
    }
}

function renderMinimap() {
    const offset = Math.min(canvas.w, canvas.h) / 20;
    const size = Math.min(canvas.w, canvas.h) / 5;

    const x = canvas.w - offset - size;
    const y = canvas.h - offset - size;

    ctx.strokeStyle = 'black';
    ctx.fillStyle = 'black';
    ctx.lineWidth = 3;

    ctx.lineJoin = ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.rect(x, y, size, size);

    ctx.globalAlpha = 0.3;
    ctx.fill();
    ctx.closePath();
    ctx.globalAlpha = 1;
    
    // Update minimap periodically
    if(time - lastRenderedMinimap > 300 && spatialHash){
        lastRenderedMinimap = time;

        minimapCanvas.width = size;
        minimapCanvas.height = size;

        minimapCanvas.style.width = size + 'px';
        minimapCanvas.style.height = size + 'px';

        minimapCanvas.style.bottom = offset + 'px';
        minimapCanvas.style.right = offset + 'px';
        
        // Clear minimap
        cx.clearRect(0, 0, size, size);
        
        // For infinite world, show nearby pieces relative to camera
        const VIEW_DIST = 100; // squares
        const nearbyPieces = spatialHash.queryRect(
            camera.x / squareSize - VIEW_DIST,
            camera.y / squareSize - VIEW_DIST,
            camera.x / squareSize + VIEW_DIST,
            camera.y / squareSize + VIEW_DIST
        );
        
        const scale = size / (VIEW_DIST * 2);
        
        for(const piece of nearbyPieces){
            if(piece.type === 0 || piece.team === 0) continue;
            
            const relX = (piece.x - camera.x / squareSize + VIEW_DIST) * scale;
            const relY = (piece.y - camera.y / squareSize + VIEW_DIST) * scale;
            
            if(relX >= 0 && relX < size && relY >= 0 && relY < size){
                let color = teamToColor(piece.team);
                cx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
                cx.fillRect(relX, relY, Math.max(2, scale), Math.max(2, scale));
            }
        }
        
        // Draw player position (center of minimap)
        cx.fillStyle = 'white';
        cx.fillRect(size/2 - 2, size/2 - 2, 4, 4);
    }
}

// Seeded rng
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

function generateTintedImages(color){
    let arr = [undefined];

    const r = color.r / 256;
    const g = color.g / 256;
    const b = color.b / 256;
    
    for(let i = 1; i < imgs.length; i++){
        const c = document.createElement('canvas');
        const cx = c.getContext('2d');
        c.width = c.height = squareSize;
        
        cx.drawImage(imgs[i], 0, 0);

        const imgData = cx.getImageData(0, 0, c.width, c.height);
        const data = imgData.data;
        for(let j = 0; j < data.length; j += 4){
            data[j] *= r;
            data[j+1] *= g;
            data[j+2] *= b;
        }

        cx.clearRect(0, 0, c.width, c.height);
        cx.putImageData(imgData, 0, 0);

        arr.push(c);
    }

    tintedImgs.set(`${color.r}_${color.g}_${color.b}`, arr);
}

// Page position to position on the canvas
function canvasPos({x, y}) {
    const canvasDimensions = canvas.getBoundingClientRect();
    x = ((x - canvasDimensions.x) / canvasDimensions.width) * canvas.width;
    y = ((y - canvasDimensions.y) / canvasDimensions.height) * canvas.height;

    const {a, b, c, d, e, f} = ctx.getTransform();

    const denom1 = (a*d - c*b);
    const denom2 = -denom1;

    const invA = d / denom1;
    const invC = c / denom2;
    const invE = (e*d - c*f) / denom2;
    const invB = b / denom2;
    const invD = a / denom1;
    const invF = (e*b - a*f) / denom1;

    return {
        x: (invA*x + invC*y + invE),
        y: (invB*x + invD*y + invF)
    }
}

// MOBILE

let joystick = {
    xPercent: 0.72,
    yPercent: 0.87,
    rPercent: 0.1
}
let angle = 0, dist = 0, coords, rCoords, stickR, dragging = false;

let buttons = [{
    text: '-',
    xPercent: 0.34,
    yPercent: 0.94,
    rPercent: 0.045,
    clicking: false
}, {
    text: '+',
    xPercent: 0.12,
    yPercent: 0.94,
    rPercent: 0.045,
    clicking: false
}];

function drawJoystick(){
    const {xPercent, yPercent, rPercent} = joystick;

    ctx.globalAlpha = .15;
    ctx.fillStyle = 'blue';
    
    coords = {x: xPercent * innerWidth, y: yPercent * innerHeight};
    rCoords = {x: (xPercent) * innerWidth, y: (yPercent + rPercent) * innerHeight};
    stickR = (rCoords.y - coords.y);
    
    ctx.beginPath();
    ctx.arc(coords.x, coords.y, stickR, 0, Math.PI*2);
    ctx.fill();
    ctx.closePath();
    
    ctx.globalAlpha = .18;
    ctx.beginPath();
    ctx.arc(coords.x + Math.cos(angle) * dist, coords.y + Math.sin(angle) * dist, stickR/2, 0, Math.PI*2);
    ctx.fill();
    ctx.closePath();
    
    ctx.globalAlpha = 1;
}

function drawButtons(){
    for(let i = 0; i < buttons.length; i++){
        drawButton(buttons[i]);
    }
}

function drawButton(b){
    const {clicking, xPercent, yPercent, rPercent, text} = b;
    const coords = {x: xPercent * innerWidth, y: yPercent * innerHeight};
    const rCoords = {x: xPercent * innerWidth, y: (yPercent + rPercent) * innerHeight};
    const btnR = rCoords.y - coords.y;

    ctx.fillStyle = 'blue';
    ctx.globalAlpha = clicking? .56 : .3;

    ctx.beginPath();
    ctx.arc(coords.x, coords.y, btnR, 0, Math.PI * 2);
    ctx.fill();
    ctx.closePath();

    ctx.globalAlpha *= 1.79;

    ctx.fillStyle = '#f0f0f0';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 120px Monospace`;
    ctx.fillText(text, coords.x, coords.y);

    ctx.globalAlpha = 1;
}

if(isMobile) {
    const oldMouseDown = window.onmousedown;
    const oldMouseMove = window.onmousemove;
    const oldMouseUp = window.onmouseup;
    window.addEventListener("touchstart", (e) => {
        const c = e.changedTouches[0];
        defineTouch(c);
        oldMouseDown(c);
        oldMouseMove(c);
    });
    window.addEventListener("touchmove", (e) => {
        const c = e.changedTouches[0];
        defineTouch(c);
        oldMouseMove(c);
        return e.preventDefault();
    }, {passive: false});
    window.addEventListener("touchend", (e) => {
        const c = e.changedTouches[0];
        defineTouch(c);
        oldMouseMove(c);
        oldMouseUp(c);
    });
    function defineTouch(e){
        e.preventDefault = () => {};
        e.x = e.pageX;
        e.y = e.pageY;
    }
    window.onmousedown = window.onmouseup = window.onmousemove = () => {};
}

function interpolate(s, e, t){
    return (1-t) * s + e * t;
}
