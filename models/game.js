// game.js
export class Game {
  constructor(id) { 
    this.id = id; // id de la game
    this.tick = 0; // compteur de tick du serv
    this.state = 'LOBBY';                // LOBBY | RUNNING | FINISHED
    this.createdAt = Date.now(); // date de création
    
    this._loop = null;
    this.players = new Map();
  }

  addPlayer(player){
    if (!player || !player.id) return false;
    if (this.players.has(player.id)) return this.players.get(player.id);
    this.players.set(player.id, player)
  }
  start() {
    if (this._loop) return;
    this._loop = setInterval(() => { this.state.tick++; }, 100); // 10 Hz
  }
  stop(reason = 'stopped') {
    if (this._loop) clearInterval(this._loop);
    if (this._expiryTimer) clearTimeout(this._expiryTimer);
    this._loop = null;
    this.state.reason = reason;
  }

  tickUpdate() {
    this.tick++;

    // logique de jeu
    this.simulate();

    // push état (le “render” côté serveur)
    this.broadcastState();
  }

  simulate(){
    // BOUCLE CORRESPONDANT A UN TOUR DE JEU
    if (tick < 600){
        // phase de lobby
    }else{
        // phase de jeu normale
    }
  }
  snapshot() {
    return { id: this.id, createdAt: this.createdAt, tick: this.tick };
  }
}
