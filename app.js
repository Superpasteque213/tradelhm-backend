// app.js (ESM)
import Fastify from 'fastify';
import { Server as IOServer } from 'socket.io';
import Redis from 'ioredis';           // si tu l'utilises
import crypto from 'node:crypto';      // si tu l'utilises
import { NetworkManager } from './network/NetworkManager.js';
import { GameManager }  from './models/game-manager.js';

const app = Fastify();


app.get("/", (req, reply) => {
  reply.type("text/html").send(`
    <!DOCTYPE html>
    <html>
      <body>
        <button id="connect">Connexion socket</button>
        <button id="create">Créer game</button>
        <pre id="log"></pre>

        <script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
        <script>
          let socket = null;
          const log = (x) => {
            document.getElementById("log").textContent += x + "\\n";
          };

          document.getElementById("connect").onclick = () => {
            socket = io("http://localhost:5742", { auth: { token: null } });

            socket.on("connect", () => log("connect: " + socket.id));
            socket.on("games:list", (x) => log("games:list → " + JSON.stringify(x)));
            socket.on("game:update", (x) => log("game:update → " + JSON.stringify(x)));
            socket.on("disconnect", () => log("disconnect"));
          };

          document.getElementById("create").onclick = () => {
            if (!socket) return;
            socket.emit("game:create");
            log("emit game:create");
          };
        </script>
      </body>
    </html>
  `);
});


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
