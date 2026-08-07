'use strict';
const fs=require('fs');
const path=require('path');
const BOT=path.join(__dirname,'bot');
if(!fs.existsSync(BOT)) throw new Error('[stability] bot/ absent — sous-module non cloné.');

function patch(rel,search,replacement,marker,label){
  const file=path.join(BOT,rel);
  let src=fs.readFileSync(file,'utf8');
  if(marker&&src.includes(marker)){ console.log(`[stability] ${label} déjà appliqué`); return; }
  const count=src.split(search).length-1;
  if(count!==1) throw new Error(`[stability] ${label}: attendu 1 occurrence, trouvé ${count}`);
  fs.writeFileSync(file,src.replace(search,replacement));
  console.log(`[stability] ${label} appliqué`);
}

const selfKeepAlivePath=path.join(BOT,'utils','selfKeepAlive.js');
fs.mkdirSync(path.dirname(selfKeepAlivePath),{recursive:true});
fs.writeFileSync(selfKeepAlivePath,`'use strict';
const DEFAULT_INTERVAL_MS=20*60*1000;
function getSelfJid(sock){
  const candidates=[sock?.user?.jid,sock?.user?.id].filter(Boolean);
  for(const raw of candidates){
    const number=String(raw).split(':')[0].split('@')[0].replace(/\\D/g,'');
    if(number.length>=7) return \`\${number}@s.whatsapp.net\`;
  }
  return null;
}
function startSelfKeepAlive(sock,opts={}){
  const intervalMs=Number(opts.intervalMs)>0?Number(opts.intervalMs):DEFAULT_INTERVAL_MS;
  const label=opts.label||'session';
  const sendHeartbeat=async()=>{
    const selfJid=getSelfJid(sock); if(!selfJid) return;
    try{
      await sock.sendMessage(selfJid,{text:'🟢 *THE BIG DIPPER — KEEP ALIVE*\\n\\n⏱️ Session active\\n> _Heartbeat automatique toutes les 20 minutes_'});
      console.log(\`[KeepAlive] ✅ \${label} → \${selfJid}\`);
    }catch(err){ console.warn(\`[KeepAlive] ⚠️ \${label}: \${err?.message||err}\`); }
  };
  const timer=setInterval(sendHeartbeat,intervalMs);
  if(timer.unref) timer.unref();
  return timer;
}
module.exports={DEFAULT_INTERVAL_MS,getSelfJid,startSelfKeepAlive};
`);
console.log('[stability] utils/selfKeepAlive.js écrit');

patch('utils/memoryGuard.js',
`async function triggerGracefulRestart(memMB, cfg) {\n  // Anti-spam : pas 2 restarts en moins de 3 minutes`,
`async function triggerGracefulRestart(memMB, cfg) {\n  if (process.env.RENDER === 'true') {\n    _warn(\`[MemoryGuard] Render détecté — restart volontaire annulé à \${memMB} Mo; cleanup conservé, Render gère la limite mémoire.\`);\n    _isRestartPending = false;\n    return;\n  }\n\n  // Anti-spam : pas 2 restarts en moins de 3 minutes`,
'Render détecté — restart volontaire annulé','MemoryGuard Render');

patch('index.js',
"const sessionContext = require('./utils/sessionContext'); // [PHASE 1] isolation données — voir utils/sessionContext.js",
"const sessionContext = require('./utils/sessionContext'); // [PHASE 1] isolation données — voir utils/sessionContext.js\nconst { startSelfKeepAlive } = require('./utils/selfKeepAlive');",
"require('./utils/selfKeepAlive')",'import keep-alive mono');
patch('index.js',
`let pingTimer      = null;\nlet heartbeatTimer = null;\nlet monitorTimer   = null;`,
`let pingTimer        = null;\nlet heartbeatTimer   = null;\nlet monitorTimer     = null;\nlet selfMessageTimer = null;`,
'let selfMessageTimer = null;','timer keep-alive mono');
patch('index.js',
`if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }\n      if (pingTimer)      { clearInterval(pingTimer);      pingTimer      = null; }\n      if (monitorTimer)   { clearInterval(monitorTimer);   monitorTimer   = null; }`,
`if (heartbeatTimer)   { clearInterval(heartbeatTimer);   heartbeatTimer   = null; }\n      if (pingTimer)        { clearInterval(pingTimer);        pingTimer        = null; }\n      if (monitorTimer)     { clearInterval(monitorTimer);     monitorTimer     = null; }\n      if (selfMessageTimer) { clearInterval(selfMessageTimer); selfMessageTimer = null; }`,
'clearInterval(selfMessageTimer)','cleanup keep-alive mono');
patch('index.js',
`      // ── KEEP ALIVE — 5 minutes ──────────────────────────────────`,
`      // ── MESSAGE KEEP-ALIVE IB — toutes les 20 minutes ─────────────\n      if (selfMessageTimer) clearInterval(selfMessageTimer);\n      selfMessageTimer = startSelfKeepAlive(sock, { label: 'owner-main' });\n\n      // ── KEEP ALIVE — présence Baileys ──────────────────────────────`,
"startSelfKeepAlive(sock, { label: 'owner-main' })",'démarrage keep-alive mono');

patch('utils/sessionManager.js',
"const sessionContext = require('./sessionContext');",
"const sessionContext = require('./sessionContext');\nconst { startSelfKeepAlive } = require('./selfKeepAlive');",
"require('./selfKeepAlive')",'import keep-alive multi');
patch('utils/sessionManager.js',
`timers: { heartbeat: null, monitor: null, ping: null, storeCleanup, processedTimer },`,
`timers: { heartbeat: null, monitor: null, ping: null, selfMessage: null, storeCleanup, processedTimer },`,
'selfMessage: null','timer keep-alive multi');
patch('utils/sessionManager.js',
`      console.log(\`[SessionManager] ✅ \${sessionId} connecté — @\${sId}\`);\n\n      // ── Heartbeat ──────────────────────────────────────────────────────`,
`      console.log(\`[SessionManager] ✅ \${sessionId} connecté — @\${sId}\`);\n\n      // ── Message keep-alive vers le propre IB (20 min) ─────────────────\n      if (session.timers.selfMessage) clearInterval(session.timers.selfMessage);\n      session.timers.selfMessage = startSelfKeepAlive(sock, { label: sessionId });\n\n      // ── Heartbeat ──────────────────────────────────────────────────────`,
'session.timers.selfMessage = startSelfKeepAlive','démarrage keep-alive multi');
console.log('[stability] Patch Render/keep-alive terminé.');
