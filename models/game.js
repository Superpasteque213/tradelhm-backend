// game.js (ESM)

import { Player } from './player.js';

export class Game {
  constructor(id) {
    this.id = id;
    this.tick = 0;
    this.state = 'LOBBY';          // LOBBY | RUNNING | FINISHED
    this.createdAt = Date.now();

    this._loop = null;
    this.players = new Map();
  }

  addPlayer(player) {
    if (!player || !player.id) return false;
    if (this.players.has(player.id)) return this.players.get(player.id);
    this.players.set(player.id, player);
    return player;
  }

  start() {
    if (this._loop) return;
    this._loop = setInterval(() => {
      this.tick++;
    }, 100); // 10 Hz
  }

  stop(reason = 'stopped') {
    if (this._loop) clearInterval(this._loop);
    if (this._expiryTimer) clearTimeout(this._expiryTimer);
    this._loop = null;
    this.state = 'FINISHED';
    this.reason = reason;
  }

  tickUpdate() {
    this.tick++;
    this.simulate();
    this.broadcastState?.();
  }

  simulate() {
    if (this.tick < 600) {
      // lobby
    } else {
      // jeu
    }
  }

  snapshot() {
    return {
      id: this.id,
      createdAt: this.createdAt,
      tick: this.tick
    };
  }
}
