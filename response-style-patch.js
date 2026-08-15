'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const BOT = path.join(ROOT, 'bot');
const installer = path.join(BOT, 'scripts', 'install-response-style.js');
const handler = path.join(BOT, 'handler.js');
const style = path.join(BOT, 'utils', 'responseStyle.js');
const COMPAT_MARKER = '[RESPONSE STYLE FLEXIBLE SEND ANCHOR]';

// Le lifecycle cleanup du sous-module est exécuté juste avant ce patch dans
// postinstall. On applique ensuite la vraie suppression persistante afin que
// /delsession fonctionne aussi sur les sessions déjà déconnectées.
require('./session-delete-patch');

for (const file of [installer, handler, style]) {
  if (!fs.existsSync(file)) throw new Error(`[response-style-deploy] fichier absent: ${file}`);
}

/**
 * Le sous-module historique recherche une chaîne exacte :
 *   const result = await _orig(jid, payload, opts);
 * Plusieurs patches Render légitimes peuvent modifier les arguments de cette
 * ligne avant l'installation du style. L'ancien installateur trouvait alors
 * 0 occurrence et faisait échouer le build bien que wrapSendMessage() soit
 * parfaitement valide.
 *
 * On remplace uniquement cette étape fragile par une recherche bornée à la
 * fonction wrapSendMessage(). Tous les autres garde-fous de l'installateur
 * restent inchangés et continuent de faire échouer le build en cas de vraie
 * régression.
 */
function makeInstallerPatchOrderResilient() {
  let src = fs.readFileSync(installer, 'utf8');
  if (src.includes(COMPAT_MARKER)) return;

  const oldBlock = `  handler = replaceOnce(handler, sendAnchor, sendReplacement, 'envoi central');`;
  if (!src.includes(oldBlock)) {
    throw new Error('[response-style-deploy] ancre envoi central de l\'installateur introuvable');
  }

  const newBlock = `  // ${COMPAT_MARKER}\n  if (handler.includes(sendAnchor)) {\n    handler = replaceOnce(handler, sendAnchor, sendReplacement, 'envoi central');\n  } else {\n    const wrapStart = handler.indexOf('function wrapSendMessage(sock) {');\n    const wrapEndNeedle = '\\n// ==========================================\\n// MAIN MESSAGE HANDLER';\n    const wrapEnd = wrapStart < 0 ? -1 : handler.indexOf(wrapEndNeedle, wrapStart);\n    if (wrapStart < 0 || wrapEnd < 0 || wrapEnd <= wrapStart) {\n      throw new Error('[response-style] envoi central: région wrapSendMessage introuvable');\n    }\n\n    const wrapRegion = handler.slice(wrapStart, wrapEnd);\n    const flexibleSend = /(?:const|let)\\s+result\\s*=\\s*await\\s+_orig\\s*\\(\\s*jid\\s*,[\\s\\S]*?\\)\\s*;/g;\n    const matches = [...wrapRegion.matchAll(flexibleSend)];\n    if (matches.length !== 1) {\n      throw new Error('[response-style] envoi central flexible: attendu 1 appel _orig dans wrapSendMessage, trouvé ' + matches.length);\n    }\n\n    const match = matches[0];\n    const absoluteStart = wrapStart + match.index;\n    const absoluteEnd = absoluteStart + match[0].length;\n    handler = handler.slice(0, absoluteStart) + sendReplacement.trimStart() + handler.slice(absoluteEnd);\n    console.log('[response-style] envoi central détecté via ancre flexible');\n  }`;

  src = src.replace(oldBlock, newBlock);
  fs.writeFileSync(installer, src, 'utf8');

  const check = spawnSync(process.execPath, ['--check', installer], { encoding: 'utf8' });
  if (check.status !== 0) {
    throw new Error(`[response-style-deploy] installateur compat invalide: ${check.stderr || check.stdout}`);
  }
  console.log('[response-style-deploy] installateur rendu résilient à l\'ordre des patches');
}

makeInstallerPatchOrderResilient();

const run = spawnSync(process.execPath, [installer], { cwd: BOT, encoding: 'utf8' });
if (run.stdout) process.stdout.write(run.stdout);
if (run.stderr) process.stderr.write(run.stderr);
if (run.status !== 0) throw new Error(`[response-style-deploy] installation échouée (${run.status})`);

for (const file of [style, handler]) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error(`[response-style-deploy] syntaxe invalide ${path.relative(BOT, file)}: ${check.stderr || check.stdout}`);
}

const finalHandler = fs.readFileSync(handler, 'utf8');
const required = [
  '[RESPONSE STYLE DISCIPLINE]',
  '[PRIVATE SEND SAFETY]',
  '[QUOTED SEND RETRY]',
  '[RELAY RESPONSE WATCH]',
  '[PENDING RESPONSE WATCH]',
  '[COMMAND RESPONSE WATCHDOG]',
  '[COMMAND ERROR RESPONSE]',
  '[COMMAND RESPONSE CONTEXT]',
  'commandResponseStorage.run(',
  'responseTrace.responses += 1',
  'relayTrace.responses += 1',
  'commandResponseTrace.pending > 0',
];
for (const marker of required) {
  if (!finalHandler.includes(marker)) {
    throw new Error(`[response-style-deploy] garde-fou absent du handler final: ${marker}`);
  }
}

console.log('[response-style-deploy] ✅ send/relay/pending suivis; anti-silence appliqué au bot déployé');
