const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const Dice = require('./public/dice');

function createDiceServer({rateLimit = 20, rateWindowMs = 10000} = {}) {
    const app = express();
    const server = http.createServer(app);
    const io = new Server(server, {maxHttpBufferSize: Dice.LIMITS.message});
    let sharedRollHistory = [];
    app.use(express.static(path.join(__dirname, 'public')));
    io.on('connection', socket => {
        // One modest per-connection budget, including invalid/unknown events and sync.
        // Reconnecting bypasses this budget; it is not anonymous-room DoS protection.
        let windowStart = Date.now(), events = 0, rateReplySent = false;
        socket.use((packet, next) => {
            const now = Date.now();
            if (now - windowStart >= rateWindowMs) { windowStart = now; events = 0; rateReplySent = false; }
            if (++events > rateLimit) {
                // At most one over-budget reply per window, never a broadcast/alert flood.
                const ack = packet[packet.length - 1];
                if (!rateReplySent && packet[0] === 'playerRoll' && typeof ack === 'function') {
                    rateReplySent = true; ack({ok:false,reason:'rate-limit'});
                }
                return;
            }
            next();
        });
        socket.emit('initialHistory', sharedRollHistory);
        socket.on('playerRoll', (input, ack) => {
            let data;
            try { data = Dice.canonical(input); }
            catch {
                if (typeof ack === 'function') ack({ok:false,reason:'invalid'});
                else socket.emit('rollRejected', 'Invalid roll data');
                return;
            }
            data.time = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
            sharedRollHistory.unshift(data);
            sharedRollHistory.length = Math.min(sharedRollHistory.length, Dice.LIMITS.history);
            io.emit('broadcastRoll', data);
            if (typeof ack === 'function') ack({ok:true});
        });
        socket.on('requestSync', () => socket.emit('initialHistory', sharedRollHistory));
        // No anonymous client may erase the shared room log.
        socket.on('clearSharedHistory', () => socket.emit('clearHistoryDenied', 'Shared history clearing is disabled'));
    });
    return {app,server,io};
}
if (require.main === module) {
    const {server} = createDiceServer();
    const host = process.env.LISTEN_HOST || '127.0.0.1';
    const port = Number(process.env.PORT || 3000);
    server.listen(port, host, () => console.log(`Dice server listening on ${host}:${port}`));
}
module.exports = {createDiceServer};
