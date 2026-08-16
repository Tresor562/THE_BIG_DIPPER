'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BOT = path.join(__dirname, 'bot');
const file = path.join(BOT, 'commands', 'group_guardians', 'kickall.js');
const sessionManagerFile = path.join(BOT, 'utils', 'sessionManager.js');
if (!fs.existsSync(file)) throw new Error('[kickall-policy] kickall.js introuvable');

let src = fs.readFileSync(file, 'utf8');

function replaceOnce(search, replacement, label) {
  const count = src.split(search).length - 1;
  if (count === 0 && src.includes(replacement)) {
    console.log(`[kickall-policy] ${label} déjà appliqué`);
    return;
  }
  if (count !== 1) throw new Error(`[kickall-policy] ${label}: attendu 1 occurrence, trouvé ${count}`);
  src = src.replace(search, replacement);
  console.log(`[kickall-policy] ${label} appliqué`);
}

// Le bot peut être exposé en id/jid/lid selon la version Baileys.
replaceOnce(
  "const ids = [sock.user?.id, sock.user?.lid].filter(Boolean);",
  "const ids = [sock.user?.id, sock.user?.jid, sock.user?.lid].filter(Boolean);",
  'identité bot LID/PN'
);

// Politique demandée : protéger uniquement les owners du bot, jamais les sudo.
const ownerStart = src.indexOf('function isBotOwnerOrSudo(jid) {');
const ownerEndMarker = '\n}\n\n// ── Invalider le cache groupe';
const ownerEnd = ownerStart === -1 ? -1 : src.indexOf(ownerEndMarker, ownerStart);
if (ownerStart !== -1 && ownerEnd !== -1) {
  const replacement = `function isBotOwner(jid) {\n  const num = String(jid || '').split(':')[0].split('@')[0].replace(/\\D/g, '');\n  const protectedOwners = [\n    ...(config.ownerNumber || []),\n    ...(config.supremeOwners || []),\n  ].map(n => String(n).replace(/\\D/g, ''));\n  return protectedOwners.includes(num);\n}`;
  src = src.slice(0, ownerStart) + replacement + src.slice(ownerEnd + 2);
  console.log('[kickall-policy] protection sudo supprimée; owners conservés');
} else if (!src.includes('function isBotOwner(jid) {')) {
  throw new Error('[kickall-policy] fonction owner/sudo introuvable');
}

replaceOnce(
  "if (isBotOwnerOrSudo(p.id)) {\n          countOwners++;\n          skipped.push({ jid: p.id, raison: 'owner/sudo bot' });\n          continue;\n        }",
  "if ([p.id, p.jid, p.lid, p.userJid, p.phoneJid].some(isBotOwner)) {\n          countOwners++;\n          skipped.push({ jid: p.id || p.jid, raison: 'owner bot' });\n          continue;\n        }",
  'filtrage owners uniquement'
);

// Remplacer la résolution d'expulsion par une stratégie qui préfère toujours
// un JID téléphone standard fourni par les métadonnées avant de retomber sur LID.
const resolutionStart = src.indexOf("        const isStandardJid = p.id?.endsWith('@s.whatsapp.net') || p.id?.endsWith('@c.us');");
const resolutionEndNeedle = "        countMembers++;\n        toKick.push(kickJid);";
const resolutionEnd = resolutionStart === -1 ? -1 : src.indexOf(resolutionEndNeedle, resolutionStart);
if (resolutionStart !== -1 && resolutionEnd !== -1) {
  const replacement = `        const candidateIds = [p.jid, p.phoneJid, p.userJid, p.id, p.lid].filter(Boolean);\n        let kickJid = candidateIds.find(j => j.endsWith('@s.whatsapp.net') || j.endsWith('@c.us')) || null;\n\n        if (!kickJid) {\n          const lidCandidate = candidateIds.find(j => j.endsWith('@lid') || j.endsWith('@hosted.lid'));\n          if (lidCandidate) {\n            try {\n              const { buildComparableIds } = require('../../utils/jidHelpers');\n              const variants = buildComparableIds(lidCandidate);\n              kickJid = variants.find(v => v.endsWith('@s.whatsapp.net') || v.endsWith('@c.us')) || lidCandidate;\n            } catch (_) {\n              kickJid = lidCandidate;\n            }\n          }\n        }\n\n        if (!kickJid) {\n          countInvalidJid++;\n          skipped.push({ jid: p.id || p.jid || 'unknown', raison: 'aucun JID exploitable' });\n          continue;\n        }\n\n        countMembers++;\n        toKick.push(kickJid);`;
  src = src.slice(0, resolutionStart) + replacement + src.slice(resolutionEnd + resolutionEndNeedle.length);
  console.log('[kickall-policy] résolution JID/LID renforcée');
} else if (!src.includes("const candidateIds = [p.jid, p.phoneJid, p.userJid, p.id, p.lid].filter(Boolean);")) {
  throw new Error('[kickall-policy] bloc de résolution JID introuvable');
}

// Adapter les libellés de diagnostic pour refléter la nouvelle politique.
src = src
  .replace('Owners/sudo exclus  :', 'Owners exclus       :')
  .replace("raison: 'owner/sudo bot'", "raison: 'owner bot'");

fs.writeFileSync(file, src);
console.log('[kickall-policy] ✅ kickall: admins + owners préservés, sudo expulsables');

// ── OWNER DE LA SESSION APPARIÉE : commandes fromMe ──────────────────────
// Sur Baileys multi-device, un message envoyé depuis le téléphone auquel la
// session est connectée peut arriver en `messages.upsert` avec type="append"
// et fromMe=true. Le bot principal accepte déjà ce cas dans index.js, mais le
// SessionManager multi-session n'acceptait que `notify` : le propriétaire de
// la session pouvait donc taper .kickall et être ignoré avant même le handler.
// On aligne ici les sous-sessions sur le comportement du bot principal.
if (!fs.existsSync(sessionManagerFile)) throw new Error('[kickall-policy] utils/sessionManager.js introuvable');
let manager = fs.readFileSync(sessionManagerFile, 'utf8');

const listenerOld = "  sock.ev.on('messages.upsert', async ({ messages, type }) => {\n    if (type !== 'notify') return;";
const listenerNew = "  sock.ev.on('messages.upsert', async ({ messages, type }) => {\n    if (type !== 'notify' && type !== 'append') return;";
if (manager.includes(listenerOld)) {
  manager = manager.replace(listenerOld, listenerNew);
  console.log('[kickall-policy] sous-session: messages append/fromMe autorisés');
} else if (!manager.includes(listenerNew)) {
  throw new Error('[kickall-policy] listener messages.upsert sous-session introuvable');
}

const loopOld = "    for (const msg of messages) {\n      if (!msg.message || !msg.key?.id) continue;";
const loopNew = "    for (const msg of messages) {\n      if (!msg.message || !msg.key?.id) continue;\n      // append est réservé aux messages envoyés depuis le compte connecté;\n      // ignorer les append entrants pour éviter un double traitement.\n      if (type === 'append' && !msg.key.fromMe) continue;";
if (manager.includes(loopOld)) {
  manager = manager.replace(loopOld, loopNew);
  console.log('[kickall-policy] sous-session: doublons append non-fromMe filtrés');
} else if (!manager.includes("if (type === 'append' && !msg.key.fromMe) continue;")) {
  throw new Error('[kickall-policy] boucle messages sous-session introuvable');
}

fs.writeFileSync(sessionManagerFile, manager, 'utf8');

const finalManager = fs.readFileSync(sessionManagerFile, 'utf8');
if (!finalManager.includes("type !== 'notify' && type !== 'append'")) {
  throw new Error('[kickall-policy] garde append/fromMe absente après patch');
}
if (!finalManager.includes("type === 'append' && !msg.key.fromMe")) {
  throw new Error('[kickall-policy] filtre append non-fromMe absent après patch');
}

for (const checkedFile of [file, sessionManagerFile]) {
  const check = spawnSync(process.execPath, ['--check', checkedFile], { encoding: 'utf8' });
  if (check.status !== 0) {
    throw new Error(`[kickall-policy] syntaxe invalide ${path.relative(BOT, checkedFile)}: ${check.stderr || check.stdout}`);
  }
}

console.log('[kickall-policy] ✅ owner de session appariée: .kickall atteint le handler en notify ou append/fromMe');
