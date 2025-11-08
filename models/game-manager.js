// game-manager.js (ESM)

import { Game } from './game.js';
import crypto from 'node:crypto';

export class GameManager {
  constructor() {
    this.games = new Map();
  }

  createGame() {
    const id = newId('game');
    const g = new Game(id);
    this.games.set(id, g);
    return g;
  }

  get(id) {
    return this.games.get(id) || null;
  }

  list() {
    return [...this.games.values()].map(g => g.snapshot());
  }
}

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}
