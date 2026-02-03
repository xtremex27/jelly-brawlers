const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(express.static('public'));

const players = {};

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    // Send existing players to new player
    socket.emit('currentPlayers', players);

    socket.on('joinGame', (playerData) => {
        players[socket.id] = {
            id: socket.id,
            x: playerData.x,
            z: playerData.z,
            type: playerData.type,
            hp: playerData.hp,
            playerId: socket.id
        };
        // Tell everyone else a new player joined
        socket.broadcast.emit('newPlayer', players[socket.id]);
    });

    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y; // Capture Y
            players[socket.id].z = movementData.z;
            players[socket.id].rotation = movementData.rotation;
            // Relay to everyone else
            socket.broadcast.emit('playerMoved', {
                id: socket.id,
                x: players[socket.id].x,
                y: players[socket.id].y || 0, // Send Y or default to 0
                z: players[socket.id].z,
                rotation: players[socket.id].rotation
            });
        }
    });

    socket.on('playerAttack', () => {
        socket.broadcast.emit('playerAttacked', { id: socket.id });
    });

    socket.on('playerPickup', (data) => {
        socket.broadcast.emit('playerPickup', { playerId: socket.id, type: data.type });
    });

    socket.on('shoot', (data) => {
        socket.broadcast.emit('shoot', { ...data, attackerId: socket.id });
    });

    // Handle Hit Event (Attacker -> Server -> Target)
    socket.on('hitPlayer', (data) => {
        const target = players[data.targetId];
        if (target) {
            target.hp -= data.damage;
            io.emit('playerHit', {
                id: data.targetId,
                damage: data.damage,
                hp: target.hp,
                attackerId: socket.id
            });

            if (target.hp <= 0) {
                target.hp = 5; // Rez logic needed later
                io.emit('playerDied', {
                    id: data.targetId,
                    killerId: socket.id
                });
            }
        }
    });

    // Sync XP/Level
    socket.on('updateXP', (data) => {
        if (players[socket.id]) {
            players[socket.id].level = data.level;
            socket.broadcast.emit('playerLevelUpdate', { id: socket.id, level: data.level });
        }
    });

    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`listening on *:${PORT}`);
});
