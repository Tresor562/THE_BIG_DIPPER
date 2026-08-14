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

  // Variante historique où la décision était stockée dans isMaster sans
  // consulter le contexte déjà authentifié par le handler.
  src = read(file);
  const oldMaster = 'const isMaster = supremeOwners.includes(senderNumber);';
  if (src.includes(oldMaster)) {
    src = src.replace(oldMaster, "const isMaster = supremeOwners.includes(senderNumber) || extra?.isOwner === true || extra?.isSupremeOwner === true || msg?.key?.fromMe === true;");
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

function assertPostPatch(label) {
  for (const file of changed) checkSyntax(file);
  const after = auditSnapshot(label);
  if (after.legacyStrictGate.length) {
    throw new Error('[owner-command-audit] garde owner historique non corrigé: ' + after.legacyStrictGate.join(', '));
  }

  const handler = read(HANDLER);
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
    if (!save.includes('extra?.isOwner') && !/\bisOwner\b/.test(save)) {
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
}

function runOwnerSmoke(label) {
  const code = `
    const path = require('path');
    const root = ${JSON.stringify(BOT)};
    const baseExtra = {
      isOwner: true,
      isSupremeOwner: false,
      sender: '188055763857491@lid',
      from: '22900000000@s.whatsapp.net',
      phrases: { footer: () => '' },
      toSmallCaps: x => String(x),
    };
    const msg = { key: { fromMe: true, remoteJid: baseExtra.from }, message: { conversation: '.noop' } };
    const sock = { user: { id: '188055763857491:1@lid' }, sendMessage: async () => ({ key: { id: 'mock' } }) };
    async function mustReply(file, body) {
      const cmd = require(path.join(root, 'commands', 'owner_control', file));
      const replies = [];
      const m = { ...msg, message: { conversation: body } };
      const extra = { ...baseExtra, reply: async text => { replies.push(String(text)); return { key: { id: 'reply' } }; } };
      await cmd.execute(sock, m, [], extra);
      if (!replies.length) throw new Error(file + ' a ignoré le connected owner');
    }
    (async () => {
      await mustReply('save.js', '.save');
      await mustReply('inspect.js', '.inspect');
      await mustReply('reload.js', '.reload');
      await mustReply('blacklist.js', '.blacklist');
      await mustReply('ghostfile.js', '.cat');
      await mustReply('master.js', '.js');
      console.log('owner-smoke-ok');
    })().catch(err => { console.error(err.stack || err.message); process.exit(1); });
  `;
  const r = spawnSync(process.execPath, ['-e', code], { cwd: BOT, encoding: 'utf8', timeout: 15000 });
  if (r.status !== 0) throw new Error(`[owner-command-audit] ${label} smoke: ${r.stderr || r.stdout}`);
  if (!String(r.stdout).includes('owner-smoke-ok')) throw new Error(`[owner-command-audit] ${label} smoke sans confirmation`);
  console.log(`[owner-command-audit] ${label}: smoke owner-control OK`);
}

// Double vérification après application : statique + exécution sans effet de bord.
assertPostPatch('verification 1');
runOwnerSmoke('test 1');
assertPostPatch('verification 2');
runOwnerSmoke('test 2');

console.log(`[owner-command-audit] ✅ ${files.length} commandes auditées; ${changed.size} fichiers concernés corrigés; double audit + double test OK`);
