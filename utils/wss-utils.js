const { Server: WSServer } = require('ws');
const crypto = require('node:crypto');


module.exports = {

    broadcast : function(wss,payload){
        const msg = JSON.stringify(payload);
        for (const c of wss.clients) if (c.readyState === 1) c.send(msg);
    }
}