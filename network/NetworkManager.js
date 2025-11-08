//  imports
const Redis = require('ioredis');
let GameManager = require('../models/game-manager').GameManager

const redis = new Redis("redis://bonus.nc:6379"); // client vers serveur REDIS

export class NetworkManager {
  constructor({ wss, gameManager }) {
    this.wss = wss;              // instance socket.io ou ws
    this.gameManager = gameManager;
  }


  start() {
    this.wss.on('connection', async (socket) => {
       let token = req.token;
       let sess = token ? await getSession(token) : null;

        if (!sess) {
            // pas de token ou token inconnu → créer
            token = newId('session');
            const userId = newId('user');
            sess = { userId };
            await setSession(token, sess);
        }

        socket.token = token;
        socket.userId = sess.userId;

        socket.join('player:' + socket.userId) // on lie le socket à un userId qui deviendra le playerId plus tard c'est goatesque


      socket.on('game:create', (data) => {
        const game = this.gameManager.createGame(userId);
        this.broadcastLobby();
      });

      socket.on('game:join', ({ gameId, name }) => {

        let player = new Player(socket.userId,name)

        let game = this.gameManager.get(gameId)
        const ok = game.addPlayer(player);

        if (!ok) return;
        
        socket.join(gameId);

        this.broadcastGame(gameId);
        this.broadcastLobby();

      });

      socket.on('disconnect', () => {
        this.broadcastLobby();
      });
    });
  }

  // callbacks déclenchées par Game via GameManager si besoin
  notifyGameEvent(gameId, payload) {
    this.wss.to(gameId).emit('game:event', payload);
  }

  broadcastGame(gameId) {
    let game = this.gameManager.get(gameId);
    snapshot
    this.wss.to(gameId).emit('game:update', snapshot);
  }

  broadcastLobby() {
    this.wss.emit('games:list', this.gameManager.list());
  }
}

// ------------------------ UTILS -----------------------------------
async function getSession(sid) {
    // récupère la session sur redis à partir d'un session id
  if (!sid) return null;
  const raw = await redis.get(redisSessionKey(sid));
  return raw ? JSON.parse(raw) : null;
}

async function setSession(sid, data) {
    // crée une session sur redis à partir d'un id 
  await redis.setex(redisSessionKey(sid), SESS_TTL, JSON.stringify(data));
}

function newId(prefix) {
    // crée un nouvel id qui est juste une chaine aléatoire précédée d'un prefix pour identifier le type d'id
     return `${prefix}_${crypto.randomBytes(12).toString('hex')}`; 
    }
