'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BOT = path.join(__dirname, 'bot');
const COMMANDS = path.join(BOT, 'commands');
const HANDLER = path.join(BOT, 'handler.js');

if (!fs.existsSync(COMMANDS) || !fs.existsSync(HANDLER)) {
  throw new Error('[owner-command-audit] bot artefact absent');
}

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (name.endsWith('.js')) out.push(full);
  }
  return out;
}

const files = walk(COMMANDS);
const rel = file => path.relative(BOT, file).replace(/\\/g, '/');
const read = file => fs.readFileSync(file, 'utf8');
const write = (file, src) => fs.writeFileSync(file, src, 'utf8');

function checkSyntax(file) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`[owner-command-audit] syntaxe ${rel(file)}: ${r.stderr || r.stdout}`);
}

function auditSnapshot(label) {
  const findings = {
    total: files.length,
    ownerSurface: 0,
    legacyStrictGate: [],
    reconstructedOwnerDm: [],
    manualOwnerGate: [],
  };

  for (const file of files) {
    const src = read(file);
    const ownerSurface = /ownerOnly\s*:\s*true|category\s*:\s*['\"][^'\"]*(Owner|Configuration)|isOwner|isSupremeOwner|supremeOwners/.test(src);
    if (!ownerSurface) continue;
    findings.ownerSurface++;

    if (/if\s*\(\s*!supremeOwners\.includes\(senderNumber\)\s*\)\s*return\s*;/.test(src)) {
      findings.legacyStrictGate.push(rel(file));
    }
    if (/sock\.sendMessage\(\s*`\$\{senderNumber\}@s\.whatsapp\.net`/.test(src)) {
      findings.reconstructedOwnerDm.push(rel(file));
    }
    if (/if\s*\([^\n]{0,160}(isOwner|isSupremeOwner)[^\n]{0,160}\)\s*(?:return|\{)/.test(src)) {
      findings.manualOwnerGate.push(rel(file));
    }
  }

  console.log(`[owner-command-audit] ${label}: ${findings.total} commandes auditées; surface owner=${findings.ownerSurface}; strictLegacy=${findings.legacyStrictGate.length}; dmReconstruit=${findings.reconstructedOwnerDm.length}`);
  return findings;
}

const before = auditSnapshot('audit initial');
const changed = new Set();

// 1) Gardes historiques : conserver la liste historique, mais reconnaître aussi
// le propriétaire déjà authentifié par le handler central. Cela ne donne aucun
// droit supplémentaire aux autres utilisateurs.
for (const file of files) {
  let src = read(file);
  const old = /if\s*\(\s*!supremeOwners\.includes\(senderNumber\)\s*\)\s*return\s*;/g;
  if (old.test(src)) {
    src = src.replace(old, "if (!supremeOwners.includes(senderNumber) && extra?.isOwner !== true && extra?.isSupremeOwner !== true && msg?.key?.fromMe !== true) return;");
    write(file, src);
    changed.add(file);
  }
}

// 2) inspect.js : l'ancien code reconstruisait un @s.whatsapp.net depuis
// sock.user.id. Avec LID/multi-device, ce numéro peut ne pas être le PN réel.
// Répondre dans le chat d'origine évite le faux silence sans modifier la donnée.
{
  const file = path.join(COMMANDS, 'owner_control', 'inspect.js');
  if (fs.existsSync(file)) {
    let src = read(file);
    const old = "      await sock.sendMessage(`${senderNumber}@s.whatsapp.net`, {\n        text    : rapport,\n        mentions: [targetJid]\n      });";
    const neu = "      await sock.sendMessage(chatId, {\n        text    : rapport,\n        mentions: [targetJid]\n      }, chatId.endsWith('@g.us') ? { quoted: msg } : undefined); // [CONNECTED OWNER DELIVERY]";
    if (src.includes(old)) {
      src = src.replace(old, neu);
      write(file, src);
      changed.add(file);
    } else if (!src.includes('[CONNECTED OWNER DELIVERY]')) {
      throw new Error('[owner-command-audit] inspect.js: ancre de réponse inattendue');
    }
  }
}

// 3) Couche d'envoi : reply() savait déjà qu'un quoted privé peut être malformé,
// mais les commandes qui appellent sock.sendMessage directement contournaient
// ce garde. On retire uniquement quoted en privé; les groupes restent inchangés.
{
  let src = read(HANDLER);
  const old = "      const result = await _orig(jid, payload, opts);";
  const marker = '[PRIVATE QUOTED DELIVERY GUARD]';
  if (!src.includes(marker)) {
    if (!src.includes(old)) throw new Error('[owner-command-audit] handler: ancre sendMessage introuvable');
    const neu = `      let safeOpts = opts; // ${marker}\n      if (jid && !jid.endsWith('@g.us') && opts?.quoted) {\n        const { quoted, ...rest } = opts;\n        safeOpts = Object.keys(rest).length ? rest : undefined;\n      }\n      const result = await _orig(jid, payload, safeOpts);`;
    src = src.replace(old, neu);
    write(HANDLER, src);
    changed.add(HANDLER);
  }
}

// Vérification 1 après application.
for (const file of changed) checkSyntax(file);
const after1 = auditSnapshot('verification 1');
if (after1.legacyStrictGate.length) {
  throw new Error('[owner-command-audit] garde owner historique non corrigé: ' + after1.legacyStrictGate.join(', '));
}

let handler = read(HANDLER);
for (const invariant of [
  'const isMe      = isSuperMe || isOwner(sender) || msg.key.fromMe || _isSessionOwner;',
  'isOwner:        isMe,',
  '[PRIVATE QUOTED DELIVERY GUARD]',
]) {
  if (!handler.includes(invariant)) throw new Error('[owner-command-audit] invariant handler absent: ' + invariant);
}

const saveFile = path.join(COMMANDS, 'owner_control', 'save.js');
if (fs.existsSync(saveFile)) {
  const save = read(saveFile);
  if (!save.includes("extra?.isOwner !== true") && !/\bisOwner\b/.test(save)) {
    throw new Error('[owner-command-audit] save.js ne reconnaît toujours pas le connected owner');
  }
}

const inspectFile = path.join(COMMANDS, 'owner_control', 'inspect.js');
if (fs.existsSync(inspectFile)) {
  const inspect = read(inspectFile);
  if (inspect.includes('sock.sendMessage(`${senderNumber}@s.whatsapp.net`')) {
    throw new Error('[owner-command-audit] inspect.js reconstruit encore un faux DM owner');
  }
}

// Vérification 2 indépendante : relire depuis disque, rechecker toutes les
// commandes modifiées et refaire les invariants afin de détecter une écriture
// partielle ou un patch non idempotent.
for (const file of [...changed]) checkSyntax(file);
const after2 = auditSnapshot('verification 2');
if (after2.legacyStrictGate.length) throw new Error('[owner-command-audit] régression garde owner après seconde lecture');
handler = read(HANDLER);
if (!handler.includes('[PRIVATE QUOTED DELIVERY GUARD]')) throw new Error('[owner-command-audit] garde livraison privé perdu');

console.log(`[owner-command-audit] ✅ ${files.length} commandes auditées; ${changed.size} fichiers concernés corrigés; double vérification OK`);
