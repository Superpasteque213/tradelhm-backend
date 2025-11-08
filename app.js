const Fastify = require('fastify');
const { Server: WSServer } = require('ws');
const Redis = require('ioredis');
const crypto = require('node:crypto');
const NetworkManager = require('./network/NetworkManager')

const app = Fastify(); // serveur API
const wss = new WSServer({ noServer: true }); // serveur WEBSOCKET
const redis = new Redis("redis://bonus.nc:6379"); // client vers serveur REDIS


const SESS_TTL = 60 * 60; // 1h

// Manager de parties
const manager = new GameManager();


// Démarre HTTP et accroche l'upgrade WS
(async () => {
  await app.listen({ port: 5742, host: '0.0.0.0' });
  const server = app.server;
  server.on('upgrade', async (req, socket, head) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      req.token = url.searchParams.get('token') || null;
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
    } catch { socket.destroy(); }
  });
  console.log('http://localhost:5742');
})();


//------------------------------------------------ LOGIQUE WEBSOCKETS -------------------------------------------------

const networkManager = new NetworkManager(wss,manager)
networkManager.start()

// ------------------------------------ ROUTES API ------------------------------------------------

