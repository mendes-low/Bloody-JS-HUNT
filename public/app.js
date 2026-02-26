const socket = io();

const state = {
    room: null,
    selfId: null,
    role: null,
    input: { up: false, down: false, left: false, right: false },
    quiz: null,
    toastTimer: null,
    audioEnabled: false,
};

const lobbyCard = document.getElementById("lobbyCard");
const gameCard = document.getElementById("gameCard");
const createForm = document.getElementById("createForm");
const joinForm = document.getElementById("joinForm");
const createName = document.getElementById("createName");
const joinName = document.getElementById("joinName");
const joinCode = document.getElementById("joinCode");
const roomCodeBadge = document.getElementById("roomCodeBadge");
const roleValue = document.getElementById("roleValue");
const timerValue = document.getElementById("timerValue");
const debuffValue = document.getElementById("debuffValue");
const quizTargetValue = document.getElementById("quizTargetValue");
const playerList = document.getElementById("playerList");
const feedList = document.getElementById("feedList");
const startButton = document.getElementById("startButton");
const restartButton = document.getElementById("restartButton");
const copyCodeButton = document.getElementById("copyCodeButton");
const quizModal = document.getElementById("quizModal");
const quizPrompt = document.getElementById("quizPrompt");
const quizTimer = document.getElementById("quizTimer");
const quizOptions = document.getElementById("quizOptions");
const toast = document.getElementById("toast");
const winnerOverlay = document.getElementById("winnerOverlay");
const spectatorBadge = document.getElementById("spectatorBadge");
const audioToggle = document.getElementById("audioToggle");

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

class HorrorAudio {
    constructor() {
        this.ctx = null;
        this.master = null;
        this.drone = null;
        this.pulse = null;
    }

    async enable() {
        if (!this.ctx) {
            const AudioContextClass =
                window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return;
            this.ctx = new AudioContextClass();
            this.master = this.ctx.createGain();
            this.master.gain.value = 0.04;
            this.master.connect(this.ctx.destination);

            this.drone = this.ctx.createOscillator();
            this.drone.type = "sawtooth";
            this.drone.frequency.value = 55;
            const droneGain = this.ctx.createGain();
            droneGain.gain.value = 0.06;
            this.drone.connect(droneGain);
            droneGain.connect(this.master);
            this.drone.start();

            this.pulse = this.ctx.createOscillator();
            this.pulse.type = "triangle";
            this.pulse.frequency.value = 2.2;
            const pulseGain = this.ctx.createGain();
            pulseGain.gain.value = 0.02;
            this.pulse.connect(pulseGain);
            pulseGain.connect(this.master);
            this.pulse.start();
        }

        if (this.ctx.state === "suspended") {
            await this.ctx.resume();
        }
    }

    sting() {
        if (!this.ctx || this.ctx.state !== "running") return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "square";
        const now = this.ctx.currentTime;
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(70, now + 0.6);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.15, now + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
        osc.connect(gain);
        gain.connect(this.master);
        osc.start(now);
        osc.stop(now + 0.75);
    }
}

const horrorAudio = new HorrorAudio();

audioToggle.addEventListener("click", async () => {
    state.audioEnabled = !state.audioEnabled;
    if (state.audioEnabled) {
        await horrorAudio.enable();
        audioToggle.textContent = "Sound enabled";
        showToast("Sound enabled.");
    } else {
        if (horrorAudio.master) {
            horrorAudio.master.gain.value = 0.0001;
        }
        audioToggle.textContent = "Enable sound";
        showToast("Sound muted.");
    }
});

function showToast(message) {
    toast.textContent = message;
    toast.classList.remove("hidden");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => {
        toast.classList.add("hidden");
    }, 2600);
}

function formatSeconds(ms) {
    if (ms == null) return "-";
    return `${Math.max(0, ms / 1000).toFixed(1)}s`;
}

function getSelfPlayer() {
    return (
        state.room?.players?.find((player) => player.id === state.selfId) ||
        null
    );
}

function renderSidebar() {
    if (!state.room) return;
    roomCodeBadge.textContent = state.room.code;
    roleValue.textContent =
        state.role === "host" ? "Bloody JS host" : "Student";
    timerValue.textContent = formatSeconds(state.room.roundEndsInMs);
    debuffValue.textContent =
        state.room.hostDebuffedInMs > 0
            ? formatSeconds(state.room.hostDebuffedInMs)
            : "None";
    quizTargetValue.textContent = state.room.activeQuiz
        ? state.room.activeQuiz.playerName
        : "None";

    startButton.classList.toggle(
        "hidden",
        state.role !== "host" || state.room.gameStarted,
    );
    restartButton.classList.toggle(
        "hidden",
        state.role !== "host" || !state.room.gameStarted,
    );

    const self = getSelfPlayer();
    spectatorBadge.classList.toggle(
        "hidden",
        !self || self.alive || state.role === "host",
    );

    playerList.innerHTML = "";
    const players = [...state.room.players].sort((a, b) => {
        if (a.role !== b.role) return a.role === "host" ? -1 : 1;
        if (a.alive !== b.alive) return a.alive ? -1 : 1;
        return a.name.localeCompare(b.name);
    });

    players.forEach((player) => {
        const row = document.createElement("div");
        row.className = "player-row";
        const left = document.createElement("div");
        left.className = "player-name";
        const dot = document.createElement("span");
        dot.className = "player-dot";
        dot.style.background = player.color;
        const name = document.createElement("span");
        name.textContent = `${player.name}${player.isSelf ? " (you)" : ""}`;
        left.append(dot, name);

        const right = document.createElement("strong");
        right.textContent =
            player.role === "host"
                ? "HOST"
                : player.alive
                  ? `Alive · ${player.score}`
                  : "Out";
        row.append(left, right);
        playerList.appendChild(row);
    });

    feedList.innerHTML = "";
    state.room.messages.forEach((message) => {
        const item = document.createElement("div");
        item.className = "feed-item";
        item.textContent = message;
        feedList.appendChild(item);
    });

    if (state.room.winner) {
        winnerOverlay.classList.remove("hidden");
        winnerOverlay.innerHTML =
            state.room.winner === "host"
                ? "<strong>Host victory.</strong> The Bloody JS icon ate the entire class."
                : "<strong>Students survived.</strong> At least one student escaped until the timer ended.";
    } else {
        winnerOverlay.classList.add("hidden");
    }
}

function openGameView() {
    lobbyCard.classList.add("hidden");
    gameCard.classList.remove("hidden");
}

function syncInput() {
    socket.emit("input:update", state.input);
}

function setDirection(key, active) {
    const normalized = key.toLowerCase();
    let changed = false;
    if (normalized === "arrowup" || normalized === "w") {
        changed = state.input.up !== active;
        state.input.up = active;
    } else if (normalized === "arrowdown" || normalized === "s") {
        changed = state.input.down !== active;
        state.input.down = active;
    } else if (normalized === "arrowleft" || normalized === "a") {
        changed = state.input.left !== active;
        state.input.left = active;
    } else if (normalized === "arrowright" || normalized === "d") {
        changed = state.input.right !== active;
        state.input.right = active;
    }
    if (changed) {
        syncInput();
    }
}

document.addEventListener("keydown", (event) => {
    if (
        [
            "ArrowUp",
            "ArrowDown",
            "ArrowLeft",
            "ArrowRight",
            "w",
            "a",
            "s",
            "d",
            "W",
            "A",
            "S",
            "D",
        ].includes(event.key)
    ) {
        event.preventDefault();
    }
    setDirection(event.key, true);
});

document.addEventListener("keyup", (event) => {
    setDirection(event.key, false);
});

window.addEventListener("blur", () => {
    state.input = { up: false, down: false, left: false, right: false };
    syncInput();
});

createForm.addEventListener("submit", (event) => {
    event.preventDefault();
    socket.emit("room:create", { name: createName.value });
});

joinForm.addEventListener("submit", (event) => {
    event.preventDefault();
    socket.emit("room:join", {
        name: joinName.value,
        roomCode: joinCode.value,
    });
});

startButton.addEventListener("click", () => {
    socket.emit("room:start");
});

restartButton.addEventListener("click", () => {
    socket.emit("room:restart");
});

copyCodeButton.addEventListener("click", async () => {
    if (!state.room?.code) return;
    try {
        await navigator.clipboard.writeText(state.room.code);
        showToast("Room code copied.");
    } catch {
        showToast("Could not copy the room code.");
    }
});

socket.on("session:ready", ({ roomCode, role, selfId }) => {
    state.role = role;
    state.selfId = selfId;
    openGameView();
    showToast(
        role === "host"
            ? `Room ${roomCode} created.`
            : `Joined room ${roomCode}.`,
    );
});

socket.on("room:update", (room) => {
    state.room = room;
    renderSidebar();
    if (
        state.audioEnabled &&
        room.activeQuiz &&
        room.activeQuiz.playerId === state.selfId
    ) {
        horrorAudio.sting();
    }
});

socket.on("room:error", ({ message }) => {
    showToast(message);
});

socket.on("room:closed", ({ reason }) => {
    showToast(reason);
    state.room = null;
    state.selfId = null;
    state.role = null;
    lobbyCard.classList.remove("hidden");
    gameCard.classList.add("hidden");
});

socket.on("quiz:open", (quiz) => {
    state.quiz = {
        ...quiz,
        openedAt: performance.now(),
    };
    quizPrompt.textContent = quiz.prompt;
    quizOptions.innerHTML = "";
    quiz.options.forEach((option, index) => {
        const button = document.createElement("button");
        button.className = "quiz-option";
        button.textContent = option;
        button.addEventListener("click", () => {
            socket.emit("quiz:answer", { selectedIndex: index });
            Array.from(quizOptions.children).forEach((node) => {
                node.disabled = true;
            });
        });
        quizOptions.appendChild(button);
    });
    quizModal.classList.remove("hidden");
    if (state.audioEnabled) {
        horrorAudio.sting();
    }
});

socket.on("quiz:result", (result) => {
    showToast(result.text);
    state.quiz = null;
    quizModal.classList.add("hidden");
});

function drawMap(room) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const scaleX = canvas.width / room.map.width;
    const scaleY = canvas.height / room.map.height;

    ctx.fillStyle = "#050507";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let x = 0; x < canvas.width; x += 80) {
        ctx.strokeStyle = "rgba(255,255,255,0.02)";
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 80) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }

    room.map.obstacles.forEach((rect) => {
        ctx.fillStyle = "#13131a";
        ctx.fillRect(
            rect.x * scaleX,
            rect.y * scaleY,
            rect.width * scaleX,
            rect.height * scaleY,
        );
        ctx.strokeStyle = "rgba(239, 68, 68, 0.16)";
        ctx.strokeRect(
            rect.x * scaleX,
            rect.y * scaleY,
            rect.width * scaleX,
            rect.height * scaleY,
        );
    });

    room.players.forEach((player) => {
        if (!player.alive && player.role !== "host") return;
        const radius = player.role === "host" ? 70 : 56;
        const gradient = ctx.createRadialGradient(
            player.x * scaleX,
            player.y * scaleY,
            0,
            player.x * scaleX,
            player.y * scaleY,
            radius,
        );
        gradient.addColorStop(
            0,
            player.role === "host"
                ? "rgba(239,68,68,0.22)"
                : "rgba(255,255,255,0.10)",
        );
        gradient.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(player.x * scaleX, player.y * scaleY, radius, 0, Math.PI * 2);
        ctx.fill();
    });

    room.players.forEach((player) => {
        const px = player.x * scaleX;
        const py = player.y * scaleY;

        if (player.role === "host") {
            ctx.fillStyle = "#b91c1c";
            ctx.fillRect(px - 18, py - 18, 36, 36);
            ctx.strokeStyle = "#fecaca";
            ctx.lineWidth = 2;
            ctx.strokeRect(px - 18, py - 18, 36, 36);
            ctx.fillStyle = "#fff7ed";
            ctx.font = "bold 14px Inter, sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("JS", px, py + 5);
        } else {
            ctx.beginPath();
            ctx.fillStyle = player.alive
                ? player.color
                : "rgba(148,163,184,0.65)";
            ctx.arc(px, py, 13, 0, Math.PI * 2);
            ctx.fill();
            if (player.isSelf) {
                ctx.strokeStyle = "#ffffff";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(px, py, 17, 0, Math.PI * 2);
                ctx.stroke();
            }
        }

        ctx.fillStyle = "#f8fafc";
        ctx.font = "12px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(player.name, px, py - 20);
    });

    ctx.fillStyle = "rgba(0,0,0,0.44)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    room.players.forEach((player) => {
        if (!player.alive && player.role !== "host") return;
        const radius = player.isSelf ? 150 : player.role === "host" ? 110 : 100;
        const gradient = ctx.createRadialGradient(
            player.x * scaleX,
            player.y * scaleY,
            0,
            player.x * scaleX,
            player.y * scaleY,
            radius,
        );
        gradient.addColorStop(0, "rgba(255,255,255,0.18)");
        gradient.addColorStop(0.45, "rgba(255,255,255,0.07)");
        gradient.addColorStop(1, "rgba(0,0,0,0)");
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(player.x * scaleX, player.y * scaleY, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
    });
}

function animate() {
    requestAnimationFrame(animate);
    if (!state.room) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }

    drawMap(state.room);

    if (state.quiz) {
        const elapsed = performance.now() - state.quiz.openedAt;
        const remaining = Math.max(0, state.quiz.expiresInMs - elapsed);
        quizTimer.textContent = `${(remaining / 1000).toFixed(1)}s`;
    }
}

animate();
