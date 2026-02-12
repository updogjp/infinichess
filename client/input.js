let changed = true;
const Controls = {
  KeyW: "up",
  KeyS: "down",
  KeyA: "left",
  KeyD: "right",
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  ShiftLeft: "shift",
  ShiftRight: "shift",
  KeyZ: "zoomOut",
  KeyX: "zoomIn",
};

window.input = {};
for (let key in Controls) {
  window.input[Controls[key]] = false;
}

window.onresize = () => {
  canvas.width = canvas.w = window.innerWidth;
  canvas.height = canvas.h = window.innerHeight;
  lastRenderedMinimap = -1e5;
  changed = true;
};
window.onresize();

let chatOpen = false;
let uiHidden = false;

const chatDiv = document.querySelector(".chatContainer");
const chatMsgContainer = document.querySelector(".chat-div");
const chatInput = document.querySelector(".chat");
const lbDiv = document.querySelector(".leaderboard-div");
const visChatDiv = document.querySelector(".chat-div");

chatMsgContainer.addEventListener(
  "wheel",
  (e) => {
    if (chatMsgContainer.scrollHeight > chatMsgContainer.clientHeight) {
      return e.stopPropagation();
    }
  },
  { passive: false },
);

let loadedChat = false;

window.onkeydown = window.onkeyup = (e) => {
  if (e.repeat) return;

  if (selfId !== -1) {
    if (loadedChat === false) {
      loadedChat = true;
      chatInput.classList.remove("hidden");
      const color = teamToColor(selfId);
      chatInput.style.color = `rgb(${color.r},${color.g},${color.b})`;
    }
    if (e.type === "keydown") {
      if (e.code === "Enter") {
        if (chatOpen === true && e.type === "keydown") {
          // send chat message
          const text = chatInput.value.trim();

          if (text.length !== 0) {
            sendChatMsg(text);
          }

          chatOpen = false;
          chatInput.value = "";
          chatInput.blur();

          chatInput.style.opacity = "0";
        } else if (e.type === "keydown") {
          // focus chat
          chatOpen = true;
          chatDiv.classList.remove("hidden");
          chatInput.setAttribute("tabindex", "0");
          chatInput.focus();

          chatInput.style.opacity = "1";
        }
        return e.preventDefault();
      } else if (e.code === "KeyH" && chatOpen === false) {
        if (uiHidden === false) {
          chatInput.blur();
          if (!visChatDiv.classList.contains("hideChat")) {
            visChatDiv.classList.add("hideChat");
          }
          if (!lbDiv.classList.contains("hideLB")) {
            lbDiv.classList.add("hideLB");
          }
        } else {
          if (visChatDiv.classList.contains("hideChat")) {
            visChatDiv.classList.remove("hideChat");
            visChatDiv.scrollTop = visChatDiv.scrollHeight;
          }
          if (lbDiv.classList.contains("hideLB")) {
            lbDiv.classList.remove("hideLB");
          }
        }
        uiHidden = !uiHidden;
      }
    }

    if (chatOpen === true) {
      return;
    }
  }

  // Debug hotkeys
  if (e.type === "keydown") {
    if (e.code === "KeyT") {
      window.toggleDebugThreats?.();
    }
  }

  if (Controls[e.code] !== undefined) {
    const name = Controls[e.code];
    const state = e.type === "keydown";
    window.input[name] = state;
  }

  // if(hotkeyFns[e.code] !== undefined && e.type === 'keydown'){
  //     hotkeyFns[e.code](e);
  // }
};

window.onwheel = (e) => {
  const oldScale = camera.scale;
  camera.scale *= 1 - e.deltaY / 2100;
  if (camera.scale > 6) camera.scale = 6;
  else if (camera.scale < 0.27) camera.scale = 0.27;

  // Zoom toward mouse position: keep the world point under the cursor fixed
  const rect = canvas.getBoundingClientRect();
  const mx = ((e.clientX - rect.x) / rect.width) * canvas.width;
  const my = ((e.clientY - rect.y) / rect.height) * canvas.height;
  const cx = mx - canvas.width / 2;
  const cy = my - canvas.height / 2;

  // Adjust camera so the world point under cursor stays fixed
  camera.x = cx / camera.scale - (cx / oldScale - camera.x);
  camera.y = cy / camera.scale - (cy / oldScale - camera.y);

  changed = true;
};

function appendChatMessage(msg, color = "white", name = "", kills = 0) {
  const chatMessage = document.createElement("div");
  chatMessage.className = "chat-message";

  if (name && kills === -1) {
    // Server message
    chatMessage.className = "chat-message server-msg";
    chatMessage.innerText = msg;
    chatMessage.style.color = "#ffcc66";
  } else if (name) {
    // Player message with name [kills]: text
    chatMessage.style.borderLeftColor = color;

    const nameSpan = document.createElement("span");
    nameSpan.className = "chat-name";
    nameSpan.style.color = color;
    nameSpan.textContent = name;

    const rankSpan = document.createElement("span");
    rankSpan.className = "chat-rank";
    rankSpan.textContent = ` [${kills}]`;

    const sep = document.createTextNode(": ");

    const msgSpan = document.createElement("span");
    msgSpan.className = "chat-text";
    msgSpan.textContent = msg;

    chatMessage.appendChild(nameSpan);
    chatMessage.appendChild(rankSpan);
    chatMessage.appendChild(sep);
    chatMessage.appendChild(msgSpan);
  } else {
    chatMessage.innerText = msg;
    if (color === "rainbow") {
      setInterval(() => {
        chatMessage.style.color = `hsl(${performance.now() / 12}, 50%, 50%)`;
      }, 1000 / 60);
    } else {
      chatMessage.style.color = color;
    }
  }

  chatMsgContainer.prepend(chatMessage);
  setTimeout(() => {
    chatMessage.animate(
      [
        { opacity: 1 },
        { transform: "rotateZ(2deg)", "font-size": "0rem", opacity: 0 },
      ],
      { duration: 1000, iterations: 1 },
    );

    setTimeout(() => {
      chatMessage.remove();
    }, 950);
  }, 30000);
}

const leaderboard = document.getElementById("leaderboard-content");

// Track previous leaderboard state for animations
const prevLBState = new Map(); // id -> { rank, kills }

function updateLeaderboard(entries) {
  let mapDiv = document.getElementById("leaderboard-map-Leaderboard");
  if (!mapDiv) {
    mapDiv = document.createElement("div");
    mapDiv.classList.add("lb-group");
    mapDiv.id = "leaderboard-map-Leaderboard";
    leaderboard.appendChild(mapDiv);
  }

  // Build new state map
  const newState = new Map();
  for (let i = 0; i < entries.length; i++) {
    newState.set(entries[i].id, { rank: i, kills: entries[i].kills });
  }

  // Collect existing row elements
  const existingRows = new Map();
  for (const row of mapDiv.querySelectorAll(".lb-row")) {
    const id = parseInt(row.dataset.playerId, 10);
    if (!isNaN(id)) existingRows.set(id, row);
  }

  // Remove rows for players no longer in leaderboard
  for (const [id, row] of existingRows) {
    if (!newState.has(id)) {
      row.remove();
      existingRows.delete(id);
    }
  }

  // Create or update rows
  for (let i = 0; i < entries.length; i++) {
    const { name, id, kills, color } = entries[i];
    const colorStr = `rgb(${color.r},${color.g},${color.b})`;
    const prev = prevLBState.get(id);
    let row = existingRows.get(id);

    if (!row) {
      // Create new row
      row = document.createElement("div");
      row.classList.add("lb-row");
      row.dataset.playerId = id;

      const rankSpan = document.createElement("span");
      rankSpan.classList.add("lb-rank");
      row.appendChild(rankSpan);

      const colorInd = document.createElement("div");
      colorInd.classList.add("player-color-indicator");
      row.appendChild(colorInd);

      const nameSpan = document.createElement("span");
      nameSpan.classList.add("player-name");
      row.appendChild(nameSpan);

      const killsSpan = document.createElement("span");
      killsSpan.classList.add("lb-kills");
      row.appendChild(killsSpan);
    }

    // Update content
    row.querySelector(".lb-rank").textContent = `${i + 1}.`;
    row.querySelector(".player-color-indicator").style.backgroundColor = colorStr;
    row.querySelector(".player-name").textContent = name;
    row.querySelector(".lb-kills").textContent = kills;

    // Tint row background based on kills (subtle color gradient)
    const intensity = Math.min(kills * 2, 40);
    row.style.background = intensity > 0
      ? `rgba(${color.r},${color.g},${color.b},${intensity / 255})`
      : "transparent";

    // Animate: flash on score change
    if (prev && prev.kills !== kills) {
      row.classList.remove("lb-flash");
      void row.offsetWidth; // Force reflow to restart animation
      row.classList.add("lb-flash");
    }

    // Animate: rank movement
    if (prev && prev.rank !== i) {
      const cls = prev.rank > i ? "lb-rank-up" : "lb-rank-down";
      row.classList.remove("lb-rank-up", "lb-rank-down");
      void row.offsetWidth;
      row.classList.add(cls);
      setTimeout(() => row.classList.remove(cls), 500);
    }

    // Insert row at correct position
    const currentChildren = [...mapDiv.querySelectorAll(".lb-row")];
    if (currentChildren[i] !== row) {
      if (currentChildren[i]) {
        mapDiv.insertBefore(row, currentChildren[i]);
      } else {
        mapDiv.appendChild(row);
      }
    }
  }

  // Save state for next update
  prevLBState.clear();
  for (const [id, state] of newState) {
    prevLBState.set(id, state);
  }
}

// Legacy compat — kept for any other callers
function addToLeaderboard() {}

const isMobile =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );

if (isMobile) {
  chatInput.onclick = () => {
    chatDiv.classList.remove("hidden");
    chatInput.setAttribute("tabindex", "0");
    chatInput.focus();

    chatInput.style.opacity = "1";

    let text = prompt("Send a chat message");
    if (text.length !== 0) {
      sendChatMsg(text);
    }

    chatOpen = false;
    chatInput.value = "";
    chatInput.blur();

    chatInput.style.opacity = "0";
  };
}

function sendChatMsg(txt) {
  if (txt === "/clear") {
    while (chatMsgContainer.firstChild) {
      chatMsgContainer.firstChild.remove();
    }
    return;
  }
  const buf = new Uint8Array(txt.length + (txt.length % 2) + 2);
  buf[0] = 247;
  buf[1] = 183;
  encodeAtPosition(txt, buf, 2);
  send(buf);
}
