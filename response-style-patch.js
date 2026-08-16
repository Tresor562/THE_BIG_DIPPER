'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const BOT = path.join(ROOT, 'bot');
const installer = path.join(BOT, 'scripts', 'install-response-style.js');
const guaranteePrep = path.join(BOT, 'scripts', 'prepare-command-response-guarantee.js');
const guaranteeInstaller = path.join(BOT, 'scripts', 'install-command-response-guarantee.js');
const silentAudit = path.join(BOT, 'scripts', 'audit-silent-responses.js');
const ownerAudit = path.join(ROOT, 'verify-connected-owner-command-path.js');
const handler = path.join(BOT, 'handler.js');
const style = path.join(BOT, 'utils', 'responseStyle.js');
const COMPAT_MARKER = '[RESPONSE STYLE FLEXIBLE SEND ANCHOR]';
const LATE_AUDIT_MARKER = '[LATE CONNECTED OWNER AUDIT]';

// Le lifecycle cleanup du sous-module est exécuté juste avant ce patch dans
// postinstall. On applique ensuite la vraie suppression persistante afin que
// /delsession fonctionne aussi sur les sessions déjà déconnectées.
require('./session-delete-patch');

for (const file of [installer, guaranteePrep, guaranteeInstaller, silentAudit, ownerAudit, handler, style]) {
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

function installLateOwnerAuditHook() {
  let src = fs.readFileSync(silentAudit, 'utf8');
  if (src.includes(LATE_AUDIT_MARKER)) return;

  const exitNeedle = "console.log('[silent-audit] ✅ rapport écrit dans silent-response-audit.json (audit non bloquant)');\nprocess.exit(0);";
  if (!src.includes(exitNeedle)) {
    throw new Error('[response-style-deploy] fin audit-silent-responses introuvable');
  }

  const replacement = `console.log('[silent-audit] ✅ rapport écrit dans silent-response-audit.json (audit non bloquant)');\n\n// ${LATE_AUDIT_MARKER}\n// Ce script est le DERNIER audit du postinstall Render. On relance donc ici\n// l'audit owner connecté après tous les autres patches afin qu'une modification\n// tardive de handler.js/sessionManager.js ne puisse pas réintroduire un silence.\nconst _ownerAuditPath = path.join(__dirname, '..', '..', 'verify-connected-owner-command-path.js');\nconst _lateOwnerAudit = require('child_process').spawnSync(\n  process.execPath,\n  [_ownerAuditPath],\n  { cwd: path.join(__dirname, '..', '..'), encoding: 'utf8', timeout: 120000 }\n);\nif (_lateOwnerAudit.stdout) process.stdout.write(_lateOwnerAudit.stdout);\nif (_lateOwnerAudit.stderr) process.stderr.write(_lateOwnerAudit.stderr);\nif (_lateOwnerAudit.error) {\n  console.error('[silent-audit] ❌ audit owner connecté impossible:', _lateOwnerAudit.error.message);\n  process.exit(1);\n}\nif (_lateOwnerAudit.status !== 0) {\n  console.error('[silent-audit] ❌ audit owner connecté final échoué');\n  process.exit(_lateOwnerAudit.status || 1);\n}\nconsole.log('[silent-audit] ✅ audit owner connecté final réussi');\nprocess.exit(0);`;

  src = src.replace(exitNeedle, replacement);
  fs.writeFileSync(silentAudit, src, 'utf8');

  const check = spawnSync(process.execPath, ['--check', silentAudit], { encoding: 'utf8' });
  if (check.status !== 0) {
    throw new Error(`[response-style-deploy] audit silencieux modifié invalide: ${check.stderr || check.stdout}`);
  }
  console.log('[response-style-deploy] audit owner connecté accroché au dernier audit du build');
}

function runNode(file, label, cwd = BOT) {
  const run = spawnSync(process.execPath, [file], { cwd, encoding: 'utf8', timeout: 120_000 });
  if (run.stdout) process.stdout.write(run.stdout);
  if (run.stderr) process.stderr.write(run.stderr);
  if (run.error) throw new Error(`[response-style-deploy] ${label}: ${run.error.message}`);
  if (run.status !== 0) throw new Error(`[response-style-deploy] ${label} échoué (${run.status})`);
}

makeInstallerPatchOrderResilient();
installLateOwnerAuditHook();
runNode(installer, 'installation response-style');

// Le watchdog response-style garantissait déjà une réponse pour la majorité
// des commandes, mais honorait encore command.noReply=true. Pour le compte
// WhatsApp réellement connecté au bot, aucune commande explicite ne doit être
// silencieuse : on installe le garde-fou complet qui supprime ce bypass et
// fournit feedback/progression/erreur si la commande elle-même n'envoie rien.
runNode(guaranteePrep, 'préparation command-response-guarantee');
runNode(guaranteeInstaller, 'installation command-response-guarantee');

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
  '[COMMAND RESPONSE GUARANTEE]',
  '[NO SILENT noReply]',
  'sendCommandFeedback(',
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

// Premier audit immédiatement après installation. Le même audit est relancé
// automatiquement en toute fin de postinstall via audit-silent-responses.js.
runNode(ownerAudit, 'audit owner connecté', ROOT);

console.log('[response-style-deploy] ✅ toutes les commandes explicites ont un chemin de réponse, y compris pour le compte connecté');
