'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const handlerPath = path.join(ROOT, 'handler.js');
const marker = '[SUPREME GROUP REACTION — CLOSED GROUP SAFE]';

if (!fs.existsSync(handlerPath)) throw new Error('[supreme-react] handler.js introuvable');
let src = fs.readFileSync(handlerPath, 'utf8');

if (!src.includes(marker)) {
  const startNeedle = '    // ── RÉACTION SUPREME OWNER';
  const endNeedle = '    // ── AUTO-REACT';
  const start = src.indexOf(startNeedle);
  const end = start === -1 ? -1 : src.indexOf(endNeedle, start);
  if (start === -1 || end === -1 || end <= start) throw new Error('[supreme-react] bloc réaction Supreme introuvable');

  const replacement = `    // ── [SUPREME GROUP REACTION — CLOSED GROUP SAFE] ─────────────\n` +
`    // Réaction prioritaire : aucune dépendance à botIsAdmin/botAdminNeeded.\n` +
`    // Un Supreme Owner reçu dans un groupe déclenche la réaction même si le\n` +
`    // groupe est fermé/announce et que le bot est simple membre.\n` +
`    if (isSuperMe && isGroup && !msg.key.fromMe) {\n` +
`      const n = database.getNextSupremeReactionCount();\n` +
`      const emoji = (n % 2 === 1) ? '👨‍💻' : '🤴';\n` +
`      let reacted = false;\n` +
`      let lastReactionError = null;\n` +
`      for (let attempt = 1; attempt <= 2 && !reacted; attempt++) {\n` +
`        try {\n` +
`          await sock.sendMessage(from, { react: { text: emoji, key: msg.key } });\n` +
`          reacted = true;\n` +
`        } catch (err) {\n` +
`          lastReactionError = err;\n` +
`          if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 650));\n` +
`        }\n` +
`      }\n` +
`      if (!reacted) {\n` +
`        try {\n` +
`          const meta = await getGroupMeta();\n` +
`          const senderIsAdmin = await isAdmin(sock, sender, from, meta);\n` +
`          const botAdminState = await getBotAdmin();\n` +
`          const closed = meta?.announce === true || meta?.announce === 'true';\n` +
`          console.warn(\`[SupremeReact] réaction refusée après 2 essais | group=\${from} | closed=\${closed} | supremeAdmin=\${senderIsAdmin} | botAdmin=\${botAdminState} | error=\${String(lastReactionError?.message || lastReactionError || 'unknown').slice(0, 160)}\`);\n` +
`        } catch (_) {}\n` +
`      }\n` +
`    }\n\n`;

  src = src.slice(0, start) + replacement + src.slice(end);
  fs.writeFileSync(handlerPath, src, 'utf8');
  console.log('[supreme-react] réaction Supreme prioritaire installée');
} else {
  console.log('[supreme-react] déjà installée');
}

const check = spawnSync(process.execPath, ['--check', handlerPath], { encoding: 'utf8' });
if (check.status !== 0) throw new Error(`[supreme-react] handler invalide: ${check.stderr || check.stdout}`);

const finalSrc = fs.readFileSync(handlerPath, 'utf8');
for (const required of [marker, 'isSuperMe && isGroup && !msg.key.fromMe', "sock.sendMessage(from, { react: { text: emoji, key: msg.key } })", 'attempt <= 2']) {
  if (!finalSrc.includes(required)) throw new Error(`[supreme-react] garde-fou absent: ${required}`);
}
console.log('[supreme-react] ✅ groupe fermé/non-admin couvert sans dépendre de botIsAdmin');
