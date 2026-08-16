'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BOT = path.join(__dirname, 'bot');
const handlerPath = path.join(BOT, 'handler.js');
const indexPath = path.join(BOT, 'index.js');
const sessionManagerPath = path.join(BOT, 'utils', 'sessionManager.js');
const commandsDir = path.join(BOT, 'commands');

for (const file of [handlerPath, indexPath, sessionManagerPath]) {
  if (!fs.existsSync(file)) throw new Error(`[owner-command-audit] fichier absent: ${path.relative(BOT, file)}`);
}
if (!fs.existsSync(commandsDir)) throw new Error('[owner-command-audit] dossier commands absent');

const handler = fs.readFileSync(handlerPath, 'utf8');
const index = fs.readFileSync(indexPath, 'utf8');
const sessionManager = fs.readFileSync(sessionManagerPath, 'utf8');

function requireInvariant(source, needle, label) {
  if (!source.includes(needle)) throw new Error(`[owner-command-audit] invariant absent: ${label}`);
}

requireInvariant(index, "type !== 'notify' && type !== 'append'", 'index accepte notify + append');
requireInvariant(index, "type === 'append' && !msg.key.fromMe", 'index filtre append non-fromMe');
requireInvariant(sessionManager, "type !== 'notify' && type !== 'append'", 'sessionManager accepte notify + append');
requireInvariant(sessionManager, "type === 'append' && !msg.key.fromMe", 'sessionManager filtre append non-fromMe');
requireInvariant(sessionManager, 'sock._sessionPhoneNumber', 'numéro owner local injecté dans la sous-session');

requireInvariant(handler, 'const _isSessionOwner', 'détection owner local de session');
requireInvariant(handler, 'msg.key.fromMe || _isSessionOwner', 'fromMe/owner local inclus dans isMe');
requireInvariant(handler, 'isOwner:        isMe', 'buildExtra transmet isOwner=true');
requireInvariant(handler, 'commandResponseStorage.run(', 'watchdog de réponse central');
requireInvariant(handler, '[NO SILENT noReply]', 'aucune commande ne peut demander un silence total');
requireInvariant(handler, 'sendCommandFeedback(', 'fallback de réponse disponible');
requireInvariant(handler, 'command.execute(sock, msg, args, extra)', 'dispatch commun vers execute');

function listJs(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJs(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

function executeBlocksFromMe(executeFn) {
  const source = Function.prototype.toString.call(executeFn);
  return /if\s*\(\s*(?:msg\??\.key\??\.)?fromMe\s*\)\s*(?:return\b|\{\s*return\b)/m.test(source) ||
    /if\s*\(\s*msg\??\.key\??\.fromMe\s*===\s*true\s*\)\s*(?:return\b|\{\s*return\b)/m.test(source);
}

const files = listJs(commandsDir);
const commands = [];
const loadErrors = [];
const ownerSelfBlockers = [];

for (const file of files) {
  const rel = path.relative(BOT, file).replace(/\\/g, '/');
  const syntax = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', timeout: 15000 });
  if (syntax.error) {
    loadErrors.push(`${rel}: verification syntaxe impossible (${syntax.error.message})`);
    continue;
  }
  if (syntax.status !== 0) {
    loadErrors.push(`${rel}: syntaxe invalide`);
    continue;
  }

  let exported;
  try {
    delete require.cache[require.resolve(file)];
    exported = require(file);
  } catch (err) {
    loadErrors.push(`${rel}: ${err.message}`);
    continue;
  }

  for (const command of (Array.isArray(exported) ? exported : [exported])) {
    if (!command || typeof command !== 'object' || !command.name || typeof command.execute !== 'function') continue;

    // Ne tester que execute(). Un helper comme cacheMessage() d'antidelete peut
    // légitimement ignorer fromMe sans empêcher la commande de répondre.
    if (executeBlocksFromMe(command.execute)) {
      ownerSelfBlockers.push(`${rel}#${command.name}`);
    }

    commands.push({
      name: String(command.name),
      file: rel,
      groupOnly: !!command.groupOnly,
      privateOnly: !!command.privateOnly,
      botAdminNeeded: !!command.botAdminNeeded,
      ownerOnly: !!command.ownerOnly,
      aliases: Array.isArray(command.aliases) ? command.aliases.map(String) : [],
    });
  }
}

if (loadErrors.length) {
  throw new Error('[owner-command-audit] commandes non chargeables:\n' + loadErrors.join('\n'));
}
if (!commands.length) throw new Error('[owner-command-audit] aucune commande valide détectée');

const canonical = new Set(commands.map(c => c.name.toLowerCase()));
const duplicateNames = commands
  .map(c => c.name.toLowerCase())
  .filter((name, i, arr) => arr.indexOf(name) !== i);
if (duplicateNames.length) throw new Error('[owner-command-audit] noms canoniques dupliqués: ' + [...new Set(duplicateNames)].join(', '));

const aliasCount = commands.reduce((sum, command) => sum + command.aliases.length, 0);
const report = {
  generatedAt: new Date().toISOString(),
  commandFiles: files.length,
  commandCount: commands.length,
  canonicalCount: canonical.size,
  aliasCount,
  connectedOwnerPath: {
    mainNotifyAndAppend: true,
    pairedNotifyAndAppend: true,
    fromMeRecognizedAsOwner: true,
    localSessionOwnerRecognized: true,
    responseWatchdog: true,
    noSilentNoReply: true,
  },
  ownerSelfBlockers,
  commands,
};
fs.writeFileSync(path.join(BOT, 'connected-owner-command-audit.json'), JSON.stringify(report, null, 2));

console.log(`[owner-command-audit] ✅ ${commands.length} commandes valides + ${aliasCount} alias (${files.length} fichiers) passent par le même chemin owner connecté`);
console.log('[owner-command-audit] ✅ bot principal + sous-sessions: notify/append-fromMe acceptés');
console.log('[owner-command-audit] ✅ isMe/isOwner propagé + watchdog anti-silence actif');

if (ownerSelfBlockers.length) {
  throw new Error(
    `[owner-command-audit] ${ownerSelfBlockers.length} commande(s) bloquent encore explicitement fromMe dans execute(): ${ownerSelfBlockers.join(', ')}`
  );
}

console.log('[owner-command-audit] ✅ aucune fonction execute() ne bloque explicitement fromMe');
console.log('[owner-command-audit] ✅ audit bloquant réussi : le build s’arrête si une commande perd le chemin de réponse owner connecté');

// Plusieurs modules de commandes installent des timers lors de require(). Une
// fois l'audit terminé, ces timers ne doivent pas retenir le processus jusqu'au
// timeout de response-style-patch.js.
process.exit(0);
