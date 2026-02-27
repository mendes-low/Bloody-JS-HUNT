const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const PORT = Number(process.env.PORT || 3000);
const TICK_RATE = 30;
const STATE_RATE = 15;
const ROUND_DURATION_MS = 180000;
const QUIZ_DURATION_MS = 10000;
const HOST_DEBUFF_MS = 5000;
const MAP_WIDTH = 1600;
const MAP_HEIGHT = 900;
const PLAYER_RADIUS = 18;
const HOST_RADIUS = 22;
const HOST_SPEED = 230;
const HOST_DEBUFF_SPEED = 150;
const STUDENT_SPEED = 180;

const QUESTIONS = [
    {
        prompt: "Қазақстанның тәуелсіздігін бірінші мойындаған мемлекет?",
        options: ["Қытай", "Түркия", "АҚШ", "Қырғыстан"],
        answerIndex: 2,
    },
    {
        prompt: "Ақ аюлар неге пингвиндарды жемейді",
        options: [
            "Екеуі екі түрлі жерде тұрады",
            "Пингвиндар көп болып жүреді",
            "Пингвиндер жеп қояды",
        ],
        answerIndex: 0,
    },
    {
        prompt: "Тепе-теңдікке жауап беретін дене мүшесі ?",
        options: ["Көз", "Аяқ", "Ми", "Құлақ"],
        answerIndex: 3,
    },
    {
        prompt: "Киттің баласын қалай атайды?",
        options: ["Киттің баласы", "Бұзау", "Лақ"],
        answerIndex: 1,
    },
    {
        prompt: "Қасқырдың баласын қалай атайды?",
        options: ["Күшік", "Бөлтірік", "Арлан","Соқыр"],
        answerIndex: 1,
    },
    {
        prompt: "",
        options: [],
        answerIndex: 3,
    },
    {
        prompt: "",
        options: [],
        answerIndex: 1,
    },
    {
        prompt: "",
        options: [],
        answerIndex: 1,
    },
    {
        prompt: "",
        options: [],
        answerIndex: 2,
    },
    {
        prompt: "",
        options: [],
        answerIndex: 1,
    },
    {
        prompt: "",
        options: [],
        answerIndex: 0,
    },
    {
        prompt: "",
        options: [],
        answerIndex: 1,
    },
];

const OBSTACLES = [
    { x: 210, y: 120, width: 180, height: 180 },
    { x: 540, y: 220, width: 240, height: 90 },
    { x: 920, y: 120, width: 140, height: 260 },
    { x: 1240, y: 220, width: 180, height: 120 },
    { x: 320, y: 520, width: 220, height: 130 },
    { x: 760, y: 510, width: 200, height: 170 },
    { x: 1130, y: 560, width: 260, height: 100 },
];

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    },
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (_req, res) => {
    res.json({ ok: true, rooms: rooms.size });
});

app.get("*", (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

const rooms = new Map();
const socketToRoom = new Map();

function sanitizeName(value) {
    return (
        String(value || "Player")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 20) || "Player"
    );
}

function roomCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 5; i += 1) {
        code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return rooms.has(code) ? roomCode() : code;
}

function randomColor() {
    const colors = [
        "#7dd3fc",
        "#a78bfa",
        "#34d399",
        "#f59e0b",
        "#fb7185",
        "#f97316",
        "#22c55e",
        "#38bdf8",
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

function isCircleCollidingRect(x, y, radius, rect) {
    const closestX = Math.max(rect.x, Math.min(x, rect.x + rect.width));
    const closestY = Math.max(rect.y, Math.min(y, rect.y + rect.height));
    const dx = x - closestX;
    const dy = y - closestY;
    return dx * dx + dy * dy < radius * radius;
}

function isCollidingObstacle(x, y, radius) {
    return OBSTACLES.some((rect) => isCircleCollidingRect(x, y, radius, rect));
}

function findFreeSpawn(role) {
    const presets =
        role === "host"
            ? [{ x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 }]
            : [
                  { x: 90, y: 90 },
                  { x: MAP_WIDTH - 90, y: 90 },
                  { x: 90, y: MAP_HEIGHT - 90 },
                  { x: MAP_WIDTH - 90, y: MAP_HEIGHT - 90 },
                  { x: MAP_WIDTH / 2, y: 80 },
                  { x: MAP_WIDTH / 2, y: MAP_HEIGHT - 80 },
              ];

    const radius = role === "host" ? HOST_RADIUS : PLAYER_RADIUS;
    for (const point of presets) {
        if (!isCollidingObstacle(point.x, point.y, radius)) {
            return point;
        }
    }

    for (let attempts = 0; attempts < 500; attempts += 1) {
        const x = 60 + Math.random() * (MAP_WIDTH - 120);
        const y = 60 + Math.random() * (MAP_HEIGHT - 120);
        if (!isCollidingObstacle(x, y, radius)) {
            return { x, y };
        }
    }

    return { x: 100, y: 100 };
}

function createPlayer(socketId, name, role) {
    const spawn = findFreeSpawn(role);
    return {
        id: socketId,
        name: sanitizeName(name),
        role,
        x: spawn.x,
        y: spawn.y,
        alive: true,
        connected: true,
        color: role === "host" ? "#ef4444" : randomColor(),
        input: { up: false, down: false, left: false, right: false },
        score: 0,
    };
}

function createRoom(hostSocketId, hostName) {
    const code = roomCode();
    const host = createPlayer(hostSocketId, hostName, "host");
    const room = {
        code,
        createdAt: Date.now(),
        gameStarted: false,
        winner: null,
        roundEndsAt: null,
        players: new Map([[hostSocketId, host]]),
        hostId: hostSocketId,
        activeQuiz: null,
        hostDebuffedUntil: 0,
        messages: [`${host.name} created room ${code}.`],
    };
    rooms.set(code, room);
    socketToRoom.set(hostSocketId, code);
    return room;
}

function addMessage(room, text) {
    room.messages.unshift(text);
    room.messages = room.messages.slice(0, 8);
}

function serializeRoomFor(socketId, room) {
    const now = Date.now();
    const activeQuiz = room.activeQuiz
        ? {
              playerId: room.activeQuiz.playerId,
              playerName:
                  room.players.get(room.activeQuiz.playerId)?.name || "Student",
              expiresInMs: Math.max(0, room.activeQuiz.expiresAt - now),
          }
        : null;

    return {
        code: room.code,
        map: {
            width: MAP_WIDTH,
            height: MAP_HEIGHT,
            obstacles: OBSTACLES,
        },
        selfId: socketId,
        hostId: room.hostId,
        gameStarted: room.gameStarted,
        winner: room.winner,
        roundEndsInMs: room.roundEndsAt
            ? Math.max(0, room.roundEndsAt - now)
            : null,
        hostDebuffedInMs: Math.max(0, room.hostDebuffedUntil - now),
        activeQuiz,
        messages: room.messages,
        players: Array.from(room.players.values()).map((player) => ({
            id: player.id,
            name: player.name,
            role: player.role,
            x: player.x,
            y: player.y,
            alive: player.alive,
            connected: player.connected,
            score: player.score,
            color: player.color,
            isSelf: player.id === socketId,
        })),
    };
}

function emitRoom(room) {
    for (const playerId of room.players.keys()) {
        io.to(playerId).emit("room:update", serializeRoomFor(playerId, room));
    }
}

function movePlayer(player, deltaSeconds, room) {
    if (!player.alive || !player.connected) return;
    const quizBlocksPlayer =
        room.activeQuiz && room.activeQuiz.playerId === player.id;
    if (quizBlocksPlayer || room.winner) return;

    let dx = 0;
    let dy = 0;
    if (player.input.left) dx -= 1;
    if (player.input.right) dx += 1;
    if (player.input.up) dy -= 1;
    if (player.input.down) dy += 1;
    if (dx === 0 && dy === 0) return;

    const length = Math.hypot(dx, dy) || 1;
    dx /= length;
    dy /= length;

    const speed =
        player.role === "host"
            ? Date.now() < room.hostDebuffedUntil
                ? HOST_DEBUFF_SPEED
                : HOST_SPEED
            : STUDENT_SPEED;
    const radius = player.role === "host" ? HOST_RADIUS : PLAYER_RADIUS;

    const nextX = Math.max(
        radius,
        Math.min(MAP_WIDTH - radius, player.x + dx * speed * deltaSeconds),
    );
    const nextY = Math.max(
        radius,
        Math.min(MAP_HEIGHT - radius, player.y + dy * speed * deltaSeconds),
    );

    if (!isCollidingObstacle(nextX, player.y, radius)) {
        player.x = nextX;
    }
    if (!isCollidingObstacle(player.x, nextY, radius)) {
        player.y = nextY;
    }
}

function getAliveStudents(room) {
    return Array.from(room.players.values()).filter(
        (player) =>
            player.role === "student" && player.alive && player.connected,
    );
}

function startQuiz(room, student) {
    const question = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
    room.activeQuiz = {
        playerId: student.id,
        question,
        expiresAt: Date.now() + QUIZ_DURATION_MS,
    };
    addMessage(room, `${student.name} was caught and must answer a question.`);
    io.to(student.id).emit("quiz:open", {
        prompt: question.prompt,
        options: question.options,
        expiresInMs: QUIZ_DURATION_MS,
    });
}

function maybeEndGame(room) {
    if (room.winner) return;
    const aliveStudents = getAliveStudents(room);
    if (aliveStudents.length === 0 && room.gameStarted) {
        room.winner = "host";
        addMessage(room, "The Bloody JS icon devoured everyone. Host wins.");
    }
}

function resolveQuiz(room, selectedIndex) {
    if (!room.activeQuiz) return;
    const { playerId, question } = room.activeQuiz;
    const player = room.players.get(playerId);
    if (!player) {
        room.activeQuiz = null;
        return;
    }

    const correct = selectedIndex === question.answerIndex;
    if (correct) {
        room.hostDebuffedUntil = Date.now() + HOST_DEBUFF_MS;
        player.score += 1;
        addMessage(
            room,
            `${player.name} answered correctly. The host is weakened.`,
        );
        io.to(player.id).emit("quiz:result", {
            correct: true,
            correctIndex: question.answerIndex,
            text: "Correct. The Bloody JS icon weakens for 5 seconds.",
        });
    } else {
        player.alive = false;
        addMessage(room, `${player.name} answered incorrectly and was eaten.`);
        io.to(player.id).emit("quiz:result", {
            correct: false,
            correctIndex: question.answerIndex,
            text: "Wrong answer. You were eaten and became a spectator.",
        });
    }

    room.activeQuiz = null;
    maybeEndGame(room);
}

function startGame(room) {
    room.gameStarted = true;
    room.winner = null;
    room.roundEndsAt = Date.now() + ROUND_DURATION_MS;
    room.activeQuiz = null;
    room.hostDebuffedUntil = 0;
    for (const player of room.players.values()) {
        const spawn = findFreeSpawn(player.role);
        player.x = spawn.x;
        player.y = spawn.y;
        player.alive = true;
        player.score = 0;
        player.input = { up: false, down: false, left: false, right: false };
    }
    addMessage(room, "The hunt has started. Run.");
}

function removeSocketFromRoom(socketId) {
    const code = socketToRoom.get(socketId);
    if (!code) return;
    socketToRoom.delete(socketId);
    const room = rooms.get(code);
    if (!room) return;

    const player = room.players.get(socketId);
    if (!player) return;

    if (room.hostId === socketId) {
        io.to(code).emit("room:closed", {
            reason: "The host disconnected. The room has been closed.",
        });
        rooms.delete(code);
        return;
    }

    room.players.delete(socketId);
    addMessage(room, `${player.name} left the room.`);
    if (room.activeQuiz && room.activeQuiz.playerId === socketId) {
        room.activeQuiz = null;
    }
    maybeEndGame(room);
    emitRoom(room);
}

io.on("connection", (socket) => {
    socket.on("room:create", ({ name }) => {
        const room = createRoom(socket.id, name || "Host");
        socket.join(room.code);
        socket.emit("session:ready", {
            roomCode: room.code,
            role: "host",
            selfId: socket.id,
        });
        emitRoom(room);
    });

    socket.on("room:join", ({ roomCode: code, name }) => {
        const normalizedCode = String(code || "")
            .trim()
            .toUpperCase();
        const room = rooms.get(normalizedCode);
        if (!room) {
            socket.emit("room:error", { message: "Room not found." });
            return;
        }
        if (room.players.size >= 16) {
            socket.emit("room:error", { message: "Room is full." });
            return;
        }

        const player = createPlayer(socket.id, name || "Student", "student");
        room.players.set(socket.id, player);
        socketToRoom.set(socket.id, room.code);
        socket.join(room.code);
        addMessage(room, `${player.name} joined the room.`);
        socket.emit("session:ready", {
            roomCode: room.code,
            role: "student",
            selfId: socket.id,
        });
        emitRoom(room);
    });

    socket.on("room:start", () => {
        const code = socketToRoom.get(socket.id);
        if (!code) return;
        const room = rooms.get(code);
        if (!room || room.hostId !== socket.id) return;
        startGame(room);
        emitRoom(room);
    });

    socket.on("room:restart", () => {
        const code = socketToRoom.get(socket.id);
        if (!code) return;
        const room = rooms.get(code);
        if (!room || room.hostId !== socket.id) return;
        startGame(room);
        emitRoom(room);
    });

    socket.on("input:update", (input) => {
        const code = socketToRoom.get(socket.id);
        if (!code) return;
        const room = rooms.get(code);
        if (!room) return;
        const player = room.players.get(socket.id);
        if (!player) return;
        player.input = {
            up: Boolean(input?.up),
            down: Boolean(input?.down),
            left: Boolean(input?.left),
            right: Boolean(input?.right),
        };
    });

    socket.on("quiz:answer", ({ selectedIndex }) => {
        const code = socketToRoom.get(socket.id);
        if (!code) return;
        const room = rooms.get(code);
        if (!room || !room.activeQuiz || room.activeQuiz.playerId !== socket.id)
            return;
        resolveQuiz(room, Number.isInteger(selectedIndex) ? selectedIndex : -1);
        emitRoom(room);
    });

    socket.on("disconnect", () => {
        removeSocketFromRoom(socket.id);
    });
});

let lastTick = Date.now();
setInterval(() => {
    const now = Date.now();
    const deltaSeconds = Math.min(0.05, (now - lastTick) / 1000);
    lastTick = now;

    for (const room of rooms.values()) {
        if (!room.gameStarted || room.winner) {
            continue;
        }

        if (room.roundEndsAt && now >= room.roundEndsAt) {
            room.winner =
                getAliveStudents(room).length > 0 ? "students" : "host";
            addMessage(
                room,
                room.winner === "students"
                    ? "Time is up. At least one student survived."
                    : "Time is up. Host still wins.",
            );
            continue;
        }

        if (room.activeQuiz && now >= room.activeQuiz.expiresAt) {
            resolveQuiz(room, -1);
        }

        for (const player of room.players.values()) {
            movePlayer(player, deltaSeconds, room);
        }

        if (!room.activeQuiz) {
            const host = room.players.get(room.hostId);
            if (host && host.alive && host.connected) {
                for (const student of getAliveStudents(room)) {
                    const dx = host.x - student.x;
                    const dy = host.y - student.y;
                    const distance = Math.hypot(dx, dy);
                    if (distance <= HOST_RADIUS + PLAYER_RADIUS + 4) {
                        startQuiz(room, student);
                        break;
                    }
                }
            }
        }

        maybeEndGame(room);
    }
}, 1000 / TICK_RATE);

setInterval(() => {
    for (const room of rooms.values()) {
        emitRoom(room);
    }
}, 1000 / STATE_RATE);

server.listen(PORT, () => {
    console.log(`Bloody JS Hunt listening on http://localhost:${PORT}`);
});
