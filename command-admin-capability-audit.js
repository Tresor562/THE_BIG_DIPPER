'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, 'bot', 'commands');
if (!fs.existsSync(ROOT)) throw new Error('[command-admin-audit] bot/commands absent');

const ADMIN_CAPABILITY_PATTERNS = [
  /groupParticipantsUpdate\s*\(/,
  /groupSettingUpdate\s*\(/,
  /groupUpdateSubject\s*\(/,
  /groupUpdateDescription\s*\(/,
  /groupRevokeInvite\s*\(/,
  /groupInviteCode\s*\(/,
  /groupRequestParticipantsUpdate\s*\(/,
  /updateProfilePicture\s*\(/,
  /removeProfilePicture\s*\(/,
];

// Cas dont l'effet réel peut nécessiter les droits admin même si l'appel est masqué
// derrière un helper ou un sendMessage({ delete }). On les conserve par prudence.
const KEEP_BY_NAME = new Set([
  'add', 'kick', 'remove', 'ban', 'exil', 'promote', 'demote',
  'approveall', 'requests', 'delete', 'clean', 'kickall', 'purification',
  'grouplink', 'resetlink', 'revoke', 'setname', 'setsubject', 'setdesc',
  'setdescription', 'setgrouppp', 'setgcpp', 'groupopen', 'groupclose',
]);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const files = walk(ROOT);
const changed = [];
const kept = [];
const alreadyOk = [];

for (const file of files) {
  let src = fs.readFileSync(file, 'utf8');
  if (!/botAdminNeeded\s*:\s*true\b/.test(src)) continue;

  const base = path.basename(file, '.js').toLowerCase();
  const hasDirectAdminCapability = ADMIN_CAPABILITY_PATTERNS.some(rx => rx.test(src));
  const keep = hasDirectAdminCapability || KEEP_BY_NAME.has(base);

  if (keep) {
    kept.push(path.relative(ROOT, file));
    continue;
  }

  src = src.replace(/botAdminNeeded\s*:\s*true\b/g, 'botAdminNeeded: false // [CAPABILITY AUDIT] aucune opération WhatsApp exigeant bot-admin');
  fs.writeFileSync(file, src, 'utf8');

  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error(`[command-admin-audit] syntaxe ${file}: ${check.stderr || check.stdout}`);
  changed.push(path.relative(ROOT, file));
}

// Vérification globale : toute commande encore marquée true doit avoir une raison technique identifiable.
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  if (!/botAdminNeeded\s*:\s*true\b/.test(src)) continue;
  const base = path.basename(file, '.js').toLowerCase();
  const justified = ADMIN_CAPABILITY_PATTERNS.some(rx => rx.test(src)) || KEEP_BY_NAME.has(base);
  if (!justified) throw new Error(`[command-admin-audit] faux botAdminNeeded restant: ${path.relative(ROOT, file)}`);
  alreadyOk.push(path.relative(ROOT, file));
}

console.log(`[command-admin-audit] ✅ ${files.length} commandes auditées`);
console.log(`[command-admin-audit] faux besoins bot-admin corrigés: ${changed.length}${changed.length ? ' -> ' + changed.join(', ') : ''}`);
console.log(`[command-admin-audit] besoins bot-admin conservés car techniques: ${kept.length}`);
