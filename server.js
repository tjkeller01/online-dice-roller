const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;

// Keep a global running history of the last 50 rolls in memory
let sharedRollHistory = [];

// Serve the frontend files
app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Immediately send the existing shared history to the newly connected player
    socket.emit('initialHistory', sharedRollHistory);

    // Listen for incoming rolls from any player
    socket.on('playerRoll', (rollData) => {
        // Add to server memory
        sharedRollHistory.unshift(rollData);
        if (sharedRollHistory.length > 50) sharedRollHistory.pop();

        // Broadcast the roll out to EVERYONE connected
        io.emit('broadcastRoll', rollData);
    });

    // Request manual sync handler
    socket.on('requestSync', () => {
        socket.emit('initialHistory', sharedRollHistory);
    });

    // Clear history handler
    socket.on('clearSharedHistory', () => {
        sharedRollHistory = [];
        io.emit('historyCleared');
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
    });
});

server.listen(PORT, () => {
    console.log(`Dice Server running on port ${PORT}`);
});