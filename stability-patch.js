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

patch('utils/memoryGuard.js',
`async function triggerGracefulRestart(memMB, cfg) {\n  // Anti-spam : pas 2 restarts en moins de 3 minutes`,
`async function triggerGracefulRestart(memMB, cfg) {\n  if (process.env.RENDER === 'true') {\n    _warn(\`[MemoryGuard] Render détecté — restart volontaire annulé à \${memMB} Mo; cleanup conservé, Render gère la limite mémoire.\`);\n    _isRestartPending = false;\n    return;\n  }\n\n  // Anti-spam : pas 2 restarts en moins de 3 minutes`,
'Render détecté — restart volontaire annulé','MemoryGuard Render');

// WhatsApp change régulièrement la version Web acceptée. Le build suivant
// (auth-cache-fix.js) attend déjà fetchLatestWaWebVersion : cette étape doit
// donc être appliquée AVANT le cache Signal, sinon le postinstall échoue.
patch('utils/sessionManager.js',
`  Browsers,\n  fetchLatestBaileysVersion,\n  proto,`,
`  Browsers,\n  fetchLatestBaileysVersion,\n  fetchLatestWaWebVersion,\n  proto,`,
'  fetchLatestWaWebVersion,','import version WhatsApp Web');

patch('utils/sessionManager.js',
`let _baileysVersion = null;\nasync function getBaileysVersion() {\n  if (!_baileysVersion) {\n    const { version } = await fetchLatestBaileysVersion();\n    _baileysVersion = version;\n  }\n  return _baileysVersion;\n}`,
`let _baileysVersion = null;\nasync function getBaileysVersion() {\n  if (!_baileysVersion) {\n    try {\n      const { version, isLatest } = await fetchLatestWaWebVersion();\n      if (Array.isArray(version) && version.length === 3) {\n        _baileysVersion = version;\n        console.log('[SessionManager] 🌐 WA Web version: ' + version.join('.') + ' | latest=' + isLatest);\n      }\n    } catch (err) {\n      console.warn('[SessionManager] ⚠️ fetchLatestWaWebVersion a échoué: ' + err.message);\n    }\n    if (!_baileysVersion) {\n      const { version } = await fetchLatestBaileysVersion();\n      _baileysVersion = version;\n      console.log('[SessionManager] ↩️ fallback version Baileys: ' + version.join('.'));\n    }\n  }\n  return _baileysVersion;\n}`,
'[SessionManager] 🌐 WA Web version:','version WhatsApp Web dynamique');

console.log('[stability] Patch Render + version WhatsApp terminé.');
