// app.js (ESM)
import Fastify from 'fastify';
import { Server as IOServer } from 'socket.io';
import Redis from 'ioredis';           // si tu l'utilises
import crypto from 'node:crypto';      // si tu l'utilises
import { NetworkManager } from './network/NetworkManager.js';
import { GameManager }  from './models/game-manager.js';
import 'dotenv/config';

const app = Fastify();


app.get("/", (req, reply) => {
  reply.type("text/html").send(`
<!DOCTYPE html>
<html>
  <body>
    <p id="log"></p>
    <button id="connect">Connexion socket</button>
    <button id="create" disabled>Créer game</button>
    <button id="join" disabled>Rejoindre game</button>
    <button id="creer-batiment" disabled>Créer batiment</button>
    <button id="start-game" disabled>Start</button>

    <h3>Games</h3>
    <ul id="games"></ul>

    <script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
    <script>
      let socket = null;
      let token = localStorage.getItem("token");

      console.log(token)

      socket = io("http://${process.env.host}:${process.env.port}", { auth: { token } });

      socket.on("connect", () => {
        document.getElementById("create").disabled = false;
      });

      socket.on("session:token", (newToken) => {
        token = newToken;
        localStorage.setItem("token", token);
      });

      const gamesUl = document.getElementById("games");

      function renderGames(list) {
  gamesUl.innerHTML = "";
  list.forEach((g) => {
    const li = document.createElement("li");

    const btn = document.createElement("button");
    btn.textContent = g.id;
    btn.onclick = () => {
      console.log(g.id);
      socket.emit("game:join", {gameId : g.id, name : "Aizik le goat"});
    };

    li.appendChild(btn);
    gamesUl.appendChild(li);
  });
}
      socket.on("games:list", (data) => {
        renderGames(data);
      });

      socket.on("game:update", (data) => {
        console.log(data)
        document.getElementById("creer-batiment").disabled = false;
        document.getElementById("start-game").disabled = false;
      });

      document.getElementById("create").onclick = () => {
        socket.emit("game:create");
      };

      document.getElementById("creer-batiment").onclick = (coords = "5,5") => {
        socket.emit("batiment:build", {coords , type:"hdv"});
      };

      document.getElementById("start-game").onclick = () => {
        socket.emit("game:start");
      };
    </script>
  </body>
</html>

  `);
});


app.listen({ port: process.env.port, host: process.env.sortie });

const io = new IOServer(app.server, {
  cors: { origin: true, methods: ['GET','POST'] }
});

// domaine
const manager = new GameManager();

// réseau
const networkManager = new NetworkManager({ io, gameManager: manager });
networkManager.start();




console.log('http://'+process.env.host+":"+process.env.port);
