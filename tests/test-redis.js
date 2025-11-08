// app.js
const Fastify = require('fastify');
const { Server: WSServer } = require('ws');
const Redis = require('ioredis');
const crypto = require('node:crypto');

const app = Fastify();
const wss = new WSServer({ noServer: true });
const redis = new Redis("redis://bonus.nc:6379"); // REDIS_URL via env si besoin

const SESS_TTL = 60 * 60; // 1h
const redisSessionKey = (sid) => `session:${sid}`; // transforme un session id en clé valide redis

async function getSession(sid) {
    // récupère la session sur redis à partir d'un session id
  if (!sid) return null;
  const raw = await redis.get(redisSessionKey(sid));
  return raw ? JSON.parse(raw) : null;
}

async function setSession(sid, data) {
    // crée une session sur redis à partir 
  await redis.setex(redisSessionKey(sid), SESS_TTL, JSON.stringify(data));
}

function newId(prefix) { return `${prefix}_${crypto.randomBytes(12).toString('hex')}`; }

app.get('/', async (_, reply) => {
  reply.type('text/html').send(`<!doctype html><meta charset="utf-8">
<title>WS Token Demo</title>
<style>body{font-family:system-ui;margin:20px}#log{white-space:pre;border:1px solid #ddd;padding:8px;height:220px;overflow:auto}</style>
<h1>Client</h1>
<p>Token: <code id="token">(aucun)</code></p>
<button id="connect">Connect WS</button>
<button id="clear">Clear token</button>
<pre id="log"></pre>
<script>
const logEl = document.getElementById('log'); const out=(m)=>{logEl.textContent+=m+"\\n"; logEl.scrollTop=logEl.scrollHeight;}
const tokEl = document.getElementById('token');
function getToken(){ return localStorage.getItem('token'); }
function setToken(t){ localStorage.setItem('token', t); tokEl.textContent=t||'(aucun)'; }
setToken(getToken());

document.getElementById('clear').onclick = ()=>{ localStorage.removeItem('token'); setToken(null); };

document.getElementById('connect').onclick = ()=>{
  const t = getToken();
  const url = new URL(location.href);
  const ws = new WebSocket('ws://'+location.host+'/ws' + (t ? ('?token='+encodeURIComponent(t)) : ''));
  ws.onopen = ()=> out('WS open');
  ws.onmessage = (e)=>{
    out('← '+e.data);
    try{
      const m = JSON.parse(e.data);
      if (m.t==='welcome' && m.token) { setToken(m.token); }
    }catch{}
  };
  ws.onclose = ()=> out('WS close');
};
</script>`);
});

// Démarre HTTP et accroche l'upgrade WS
(async () => {
  await app.listen({ port: 3000, host: '0.0.0.0' });
  const server = app.server;
  server.on('upgrade', async (req, socket, head) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      req.token = url.searchParams.get('token') || null;
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
    } catch { socket.destroy(); }
  });
  console.log('http://localhost:3000');
})();

// Connexions WS: créer/charger session, associer au socket, renvoyer le token au client
wss.on('connection', async (ws, req) => {
  let token = req.token;
  let sess = token ? await getSession(token) : null;

  if (!sess) {
    // pas de token ou token inconnu → créer
    token = newId('s');
    const userId = newId('u');
    sess = { userId };
    await setSession(token, sess);
    ws.isNew = true;
  } else {
    ws.isNew = false;
  }

  ws.token = token;
  ws.userId = sess.userId;

  // message de bienvenue avec token affichable côté client
  ws.send(JSON.stringify({ t: 'welcome', token, userId: ws.userId, isNew: ws.isNew }));

  // exemple: si le client envoie quelque chose
  ws.on('message', (buf) => {
    let m; try { m = JSON.parse(buf.toString()); } catch { return; }
    if (m.t === 'ping') ws.send(JSON.stringify({ t:'pong', at: Date.now() }));
  });

  ws.on('close', () => { /* rien, session persiste en Redis avec TTL */ });
});
