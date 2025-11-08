// NetworkManager.js (ESM)

import Redis from 'ioredis';
import { GameManager } from '../models/game-manager.js';
import { Player } from '../models/player.js';
import crypto from 'node:crypto';

const SESS_TTL = 60 * 60;

const redis = new Redis("redis://bonus.nc:6379");

export class NetworkManager {
  constructor({ io, gameManager }) {
    this.io = io;
    this.gameManager = gameManager;
  }

  start() {
    this.io.on('connection', async (socket) => {
      const token = socket.handshake.auth?.token || null;
      let sess = token ? await getSession(token) : null;

      if (!sess) {
        const newToken = newId('session');
        const userId = newId('user');
        sess = { userId };
        await setSession(newToken, sess);
        socket.handshake.auth.token = newToken;
      }

      socket.data.userId = sess.userId;

      socket.join('player:' + socket.data.userId);

      socket.on('game:create', () => {
        this.gameManager.createGame();
        this.broadcastGamesToLobby();
      });

      socket.on('game:join', ({ gameId, name }) => {
        const player = new Player(socket.data.userId, name);
        const game = this.gameManager.get(gameId);
        const ok = game.addPlayer(player);
        if (!ok) return;

        socket.join(gameId);
        this.broadcastGame(gameId);
        this.broadcastGamesToLobby();
      });

      socket.on('disconnect', () => {});
    });
  }

  notifyGameEvent(gameId, payload) {
    this.io.to(gameId).emit('game:event', payload);
  }

  broadcastGame(gameId) {
    const game = this.gameManager.get(gameId);
    const snapshot = game?.toPublic ?? game;
    if (!snapshot) return;
    this.io.to(gameId).emit('game:update', snapshot);
  }

  broadcastGamesToLobby() {
    this.io.emit('games:list', this.gameManager.list());
  }
}

async function getSession(sid) {
  if (!sid) return null;
  const raw = await redis.get(redisSessionKey(sid));
  return raw ? JSON.parse(raw) : null;
}

async function setSession(sid, data) {
  await redis.setEx(redisSessionKey(sid), SESS_TTL, JSON.stringify(data));
}

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}
