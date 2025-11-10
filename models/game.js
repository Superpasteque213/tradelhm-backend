// game.js (ESM)

import { Batiment } from './batiment.js';
import { Player } from './player.js';
import crypto from 'node:crypto';

export class Game {
  constructor(id) {
    this.id = id;
    this.tick = 0;
    this.state = 'LOBBY';          // LOBBY | RUNNING | FINISHED
    this.createdAt = Date.now();

    this._loop = null;
    this.players = new Map();
    this.batiments = new Map();
    this.queue = [] // liste des instructions qui devront être executés pendant un tick
  }

  addPlayer(player) {
    // ajout d'un joueur dans la game
    if (!player || !player.id) return false;
    if (this.players.has(player.id)) return this.players.get(player.id);
    this.players.set(player.id, player);
    return player;
  }

  addBatiment(batiment){
    // ajout d'un batiment par un joueur
    if (!batiment) return false;
    if (this.batiments.has(batiment.id)) return this.batiments.get(batiment.id);
    this.batiments.set(batiment.id, batiment);
    console.log("batiment ajouté proprement")
    console.log(this.batiments)
    return batiment;
  }

  peutConstruire(playerId, coords, type){

    let player = this.players.get(playerId)

    if (this.batiments.get(coords) == null){
        if (true){ // ICI VERIFIER QUE LE JOUEUR A LES RESSOURCES POUR CONSTRUIRE)
          // permission accordée
          let batiment = new Batiment(newId("batiment"), playerId, coords)
          this.addBatiment(batiment)
    }
  }
}

  addToQueue(tick,fn){
     this.queue.push({tick : tick, fn : fn})
  }

  start() {
    console.log("demarrage de la boucle de jeu")
    if (this._loop) return;
    this._loop = setInterval(() => {
      this.tickUpdate();
    }, 1000); // 1 Hz
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
   // this.broadcastState?.();
  }

 simulate() {
  if (this.tick < 100){
  console.log("execution du tick",this.id, this.tick);
  }

  // collecter celles dues
  const due = [];
  const next = [];
  for (const item of this.queue) {
    if (item.tick <= this.tick) due.push(item);
    else next.push(item);
  }
  this.queue = next;

  if (!this.queue == []){
    console.log(this.queue)
  }

  // exécuter dans l'ordre d'insertion
  for (const { fn } of due) {
    try { 
      fn();
      console.log('fonction proprement executé au tick ',this.tick)
     }
    catch (err) { console.error('scheduled fn error:', err); }
  }
}

  snapshot() {
    return {
      id: this.id,
      createdAt: this.createdAt,
      nb_joueurs : this.players.size,
      players : this.players,
      tick: this.tick
    };
  }
   
}
function newId(prefix) {
    return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
  }