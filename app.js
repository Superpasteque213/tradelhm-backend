// app.js
const Fastify = require('fastify');
const { Server: WSServer } = require('ws');
const crypto = require('node:crypto');

const app = Fastify();
const wss = new WSServer({ noServer: true });

// État minimal (mémoire)
const matches = []; // {id, createdAt}

function broadcast(payload) {
  const msg = JSON.stringify(payload);
  for (const c of wss.clients) if (c.readyState === 1) c.send(msg);
}

// Landing ultra-basique
app.get('/', async (_, reply) => {
  reply.type('text/html').send(`<!doctype html><meta charset="utf-8" />
<title>Landing</title>
<style>
  body{font-family:system-ui;margin:20px}
  #list{display:grid;gap:8px;margin-top:12px}
  .card{border:1px solid #ddd;padding:8px;border-radius:8px}
  button{padding:8px 12px}
</style>
<h1>Créer/voir les parties</h1>
<button id="create">Créer une partie</button>
<div id="list"></div>
<script>
  const list = document.getElementById('list');
  const render = (items)=>{ list.innerHTML = items.map(m =>
    '<div class="card"><b>Partie</b> ' + m.id + ' — ' + new Date(m.createdAt).toLocaleTimeString() + '</div>'
  ).join(''); };

  // WebSocket (recv: matches|match_created)
  const ws = new WebSocket('ws://' + location.host);
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.t === 'matches') render(msg.items);
    if (msg.t === 'match_created') {
      // ajout optimiste
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = '<b>Partie</b> ' + msg.item.id + ' — ' + new Date(msg.item.createdAt).toLocaleTimeString();
      list.prepend(card);
    }
  };

  // Créer une partie
  document.getElementById('create').onclick = async () => {
    await fetch('/matches', { method: 'POST' }); // le serveur broadcast derrière
  };
</script>`);
});

// Créer une partie (POST) → broadcast à tous
app.post('/matches', async (_, reply) => {
  const match = { id: crypto.randomUUID().slice(0, 8), createdAt: Date.now() };
  matches.unshift(match);
  broadcast({ t: 'match_created', item: match });
  reply.send({ ok: true, match });
});

// Démarrer + accrocher l'upgrade WS
(async () => {
  await app.listen({ port: 3000, host: '0.0.0.0' });
  const server = app.server;
  server.on('upgrade', (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, ws => {
      wss.emit('connection', ws, req);
    });
  });
  console.log('http://localhost:3000');
})();

// À la connexion WS → envoyer l'état initial
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ t: 'matches', items: matches }));
});
