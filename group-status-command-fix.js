'use strict';
const fs=require('fs'); const path=require('path'); const {spawnSync}=require('child_process');
const BOT=path.join(__dirname,'bot'); const P=n=>path.join(BOT,'commands','group_management',n);
const files=['groupstatus.js','gc.js','gc2.js','gc3.js','gc4.js'];
for(const n of files){ if(!fs.existsSync(P(n))) throw new Error('[group-status-fix] missing '+n); }

// groupstatus: ne pas bloquer avant execute() uniquement parce que le bot n'est pas admin.
let gs=fs.readFileSync(P('groupstatus.js'),'utf8');
gs=gs.replace(/\bbotAdminNeeded\s*:\s*true\s*,?/g,'botAdminNeeded: false,');
// Le relay supplémentaire participant/type=status n'est pas nécessaire pour groupStatusMessageV2
// et peut produire un stanza invalide selon la version Baileys. Utiliser le même relay simple que gc/gc4.
gs=gs.replace(/await sock\.relayMessage\(jid, waMsg\.message, \{[\s\S]*?additionalAttributes:\s*\{ type: '4', category: 'status' \},\n\s*\}\);/,
  "await sock.relayMessage(jid, waMsg.message, { messageId: waMsg.key.id });");
fs.writeFileSync(P('groupstatus.js'),gs);

// gc2: le compte connecté doit être considéré autorisé par l'adaptateur legacy.
let g2=fs.readFileSync(P('gc2.js'),'utf8');
g2=g2.replace('isAdmin: !!extra.isAdmin,','isAdmin: !!extra.isAdmin || !!extra.isOwner || !!msg.key?.fromMe,');
// Détection du message cité dans les principaux wrappers.
g2=g2.replace("  const contextInfo = msg.message?.extendedTextMessage?.contextInfo;\n  const quotedMessage = contextInfo?.quotedMessage || null;",
`  const root = msg.message || {};\n  const contextInfo = [\n    root.extendedTextMessage?.contextInfo, root.imageMessage?.contextInfo,\n    root.videoMessage?.contextInfo, root.audioMessage?.contextInfo,\n    root.documentMessage?.contextInfo, root.stickerMessage?.contextInfo\n  ].find(c => c?.quotedMessage) || null;\n  const quotedMessage = contextInfo?.quotedMessage || null;`);
fs.writeFileSync(P('gc2.js'),g2);

// gc3: même détection quoted robuste dans le moteur et dans l'adaptateur.
let g3=fs.readFileSync(P('gc3.js'),'utf8');
g3=g3.replace('    const quoted = m.message.extendedTextMessage?.contextInfo?.quotedMessage || m.message;',
`    const root = m.message || {};\n    const qctx = [root.extendedTextMessage?.contextInfo, root.imageMessage?.contextInfo, root.videoMessage?.contextInfo, root.audioMessage?.contextInfo, root.documentMessage?.contextInfo, root.stickerMessage?.contextInfo].find(c => c?.quotedMessage);\n    const quoted = qctx?.quotedMessage || root;`);
g3=g3.replace('        const ctx = msg.message?.extendedTextMessage?.contextInfo;',
`        const root = msg.message || {};\n        const ctx = [root.extendedTextMessage?.contextInfo, root.imageMessage?.contextInfo, root.videoMessage?.contextInfo, root.audioMessage?.contextInfo, root.documentMessage?.contextInfo, root.stickerMessage?.contextInfo].find(c => c?.quotedMessage);`);
fs.writeFileSync(P('gc3.js'),g3);

// gc4: corriger le vieux pipe() sans destination dans waveform.
let g4=fs.readFileSync(P('gc4.js'),'utf8');
g4=g4.replace(/\bbotAdminNeeded\s*:\s*true\s*,?/g,'botAdminNeeded: false,');
if(g4.includes('.pipe()\n\n      .on(\'data\'')){
  g4=g4.replace('    const chunks = [];\n\n    ffmpeg(input)', '    const chunks = [];\n\n    const output = new PassThrough();\n\n    ffmpeg(input)');
  g4=g4.replace("      .pipe()\n\n      .on('data', (c) => chunks.push(c));", "      .pipe(output);\n\n    output.on('data', (c) => chunks.push(c));\n    output.on('error', reject);");
}
fs.writeFileSync(P('gc4.js'),g4);

for(const n of files){ const c=spawnSync(process.execPath,['--check',P(n)],{encoding:'utf8'}); if(c.status!==0) throw new Error('[group-status-fix] syntax '+n+': '+(c.stderr||c.stdout)); }
if(/\bbotAdminNeeded\s*:\s*true\b/.test(fs.readFileSync(P('groupstatus.js'),'utf8'))) throw new Error('[group-status-fix] groupstatus botAdminNeeded still true');
if(fs.readFileSync(P('gc4.js'),'utf8').includes('.pipe()\n')) throw new Error('[group-status-fix] gc4 waveform pipe still unsafe');
console.log('[group-status-fix] ✅ groupstatus + gc2/gc3/gc4 repaired');
