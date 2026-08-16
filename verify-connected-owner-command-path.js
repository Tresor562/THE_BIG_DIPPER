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

function extractCommandName(source, rel) {
  const m = source.match(/\bname\s*:\s*['"`]([^'"`]+)['"`]/);
  return m ? m[1] : path.basename(rel, '.js');
}

function extractAliases(source) {
  const m = source.match(/\baliases\s*:\s*\[([\s\S]*?)\]/);
  if (!m) return [];
  return [...m[1].matchAll(/['"`]([^'"`]+)['"`]/g)].map(x => x[1]);
}

function hasExplicitFromMeBlock(source) {
  const executeAt = source.search(/\basync\s+execute\s*\(|\bexecute\s*:\s*async\s*\(/);
  if (executeAt < 0) return false;
  const region = source.slice(executeAt);
  return /if\s*\(\s*(?:msg\??\.key\??\.)?fromMe\s*\)\s*(?:return\b|\{\s*return\b)/m.test(region) ||
    /if\s*\(\s*msg\??\.key\??\.fromMe\s*===\s*true\s*\)\s*(?:return\b|\{\s*return\b)/m.test(region);
}

const files = listJs(commandsDir);
const commands = [];
const syntaxErrors = [];
const ownerSelfBlockers = [];

for (const file of files) {
  const rel = path.relative(BOT, file).replace(/\\/g, '/');
  const syntax = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', timeout: 15000 });
  if (syntax.error || syntax.status !== 0) {
    syntaxErrors.push(`${rel}: ${syntax.error?.message || (syntax.stderr || syntax.stdout || 'syntaxe invalide').trim()}`);
    continue;
  }

  const source = fs.readFileSync(file, 'utf8');
  const hasExecute = /\basync\s+execute\s*\(|\bexecute\s*:\s*async\s*\(/.test(source);
  if (!hasExecute) continue;

  const name = extractCommandName(source, rel);
  if (hasExplicitFromMeBlock(source)) ownerSelfBlockers.push(`${rel}#${name}`);

  commands.push({
    name,
    file: rel,
    aliases: extractAliases(source),
    groupOnly: /\bgroupOnly\s*:\s*true\b/.test(source),
    privateOnly: /\bprivateOnly\s*:\s*true\b/.test(source),
    botAdminNeeded: /\bbotAdminNeeded\s*:\s*true\b/.test(source),
    ownerOnly: /\bownerOnly\s*:\s*true\b/.test(source),
  });
}

if (syntaxErrors.length) {
  throw new Error('[owner-command-audit] erreurs de syntaxe:\n' + syntaxErrors.join('\n'));
}
if (!commands.length) throw new Error('[owner-command-audit] aucune commande exécutable détectée');
if (ownerSelfBlockers.length) {
  throw new Error(`[owner-command-audit] ${ownerSelfBlockers.length} commande(s) bloquent encore explicitement fromMe dans execute(): ${ownerSelfBlockers.join(', ')}`);
}

const canonical = new Set(commands.map(c => c.name.toLowerCase()));
const aliasCount = commands.reduce((sum, c) => sum + c.aliases.length, 0);
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
  auditMode: 'static-build-safe',
  ownerSelfBlockers,
  commands,
};
fs.writeFileSync(path.join(BOT, 'connected-owner-command-audit.json'), JSON.stringify(report, null, 2));

console.log(`[owner-command-audit] ✅ ${commands.length} commandes analysées statiquement + ${aliasCount} alias (${files.length} fichiers)`);
console.log('[owner-command-audit] ✅ aucun require() de commande pendant le build — pas de side effects/timers/services externes');
console.log('[owner-command-audit] ✅ bot principal + sous-sessions: notify/append-fromMe acceptés');
console.log('[owner-command-audit] ✅ isMe/isOwner propagé + watchdog anti-silence actif');
console.log('[owner-command-audit] ✅ aucune fonction execute() ne bloque explicitement fromMe');
process.exit(0);
