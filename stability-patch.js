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

console.log('[stability] Patch Render terminé.');