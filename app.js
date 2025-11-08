// app.js (ESM)
import Fastify from 'fastify';
import { Server as IOServer } from 'socket.io';
import Redis from 'ioredis';           // si tu l'utilises
import crypto from 'node:crypto';      // si tu l'utilises
import { NetworkManager } from './network/NetworkManager.js';
import { GameManager }  from './models/game-manager.js';

const app = Fastify();

await app.listen({ port: 5742, host: '0.0.0.0' });

const io = new IOServer(app.server, {
  cors: { origin: true, methods: ['GET','POST'] }
});

// domaine
const manager = new GameManager();

// réseau
const networkManager = new NetworkManager({ io, gameManager: manager });
networkManager.start();

console.log('http://localhost:5742');
