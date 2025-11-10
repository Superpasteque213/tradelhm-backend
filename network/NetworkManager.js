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
      console.log("nouvelle connexion",token)
      let sess = token ? await getSessionByToken(token) : null;

      console.log(token,sess)

      if (!sess) {
        console.log("création session")
        const newToken = newId('session');
        const userId = newId('user');
        sess = { userId };
        await setSession(newToken, sess);
        socket.handshake.auth.token = newToken;
        console.log("session créée",socket.handshake.auth.token)
        socket.emit("session:token", newToken);
      }

      socket.data.userId = sess.userId;

      socket.join('player:' + socket.data.userId);

      socket.on('game:create', () => {
        console.log('création de game')
        this.gameManager.createGame();
        this.broadcastGamesToLobby();
      });

      socket.on('game:join', ({ gameId, name }) => {
        const player = new Player(socket.data.userId, name);
        const game = this.gameManager.get(gameId);
        const ok = game.addPlayer(player);
        if (!ok) return;
        
        console.log(player.name + "a rejoint la game ! joueurs connectés : " +game.players.size)
        socket.join(gameId);
        socket.data.gameId = gameId;
        this.broadcastGame(gameId);
        this.broadcastGamesToLobby();
      });

      socket.on('batiment:build',({coords,type}) => {
        // un joueur essaie de créer un batiment en spécifiant
        let gameId = socket.data.gameId;
        let playerId = socket.data.userId;

        console.log(coords,type,gameId,playerId)
        let game = this.gameManager.get(gameId);
        game.addToQueue(game.tick,()=>game.peutConstruire(playerId,coords,type))
        console.log("la fonction est demandée au tick ",game.tick)
        
      })

      socket.on('game:start', ()=>{
        let gameId = socket.data.gameId
        let game = this.gameManager.get(gameId)

        game.start()
      })

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

    let retour = {players : game.pl, nb_players : game.players.size}
    this.io.to(gameId).emit('game:update', retour);
  }

  broadcastGamesToLobby() {
    this.io.emit('games:list', this.gameManager.list());
  }
}

async function getSessionByToken(token) {
  if (!token) return null;

  console.log("début recherche session")
  console.log("query : ",token)

  const raw = await redis.get(token);

  console.log("raw : ",raw)

  console.log(raw ? JSON.parse(raw) : null)
  return raw ? JSON.parse(raw) : null;
}

async function setSession(sid, data) {
  await redis.setex(sid, SESS_TTL, JSON.stringify(data));
}

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}


