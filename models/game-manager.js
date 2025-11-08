let Game = require('./game').Game
export class GameManager {

    constructor() { 
        this.games = new Map();
    }
    create() { 
        console.log('création de la game')
        const id = newId('game'); const g = new Game(id); this.games.set(id, game); return game;
    }
    get(id) { 
        return this.games.get(id) || null; 
    }
    list() { 
        return [...this.games.values()].map((g) => g.snapshot()); 
    }
}

function newId(prefix) {
    // crée un nouvel id qui est juste une chaine aléatoire précédée d'un prefix pour identifier le type d'id
     return `${prefix}_${crypto.randomBytes(12).toString('hex')}`; 
    }
