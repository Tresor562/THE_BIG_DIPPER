'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const BOT = path.join(ROOT, 'bot');
const OVERRIDES = path.join(ROOT, 'overrides');

function ensureParent(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function copy(src, dest) {
  ensureParent(dest);
  fs.copyFileSync(src, dest);
  console.log(`[prepare] ${path.relative(ROOT, dest)}`);
}

function replaceRequired(source, search, replacement, label, expectedCount = 1) {
  const parts = source.split(search);
  const count = parts.length - 1;
  if (count !== expectedCount) {
    throw new Error(`[prepare] Patch ${label}: attendu ${expectedCount} occurrence(s), trouvé ${count}.`);
  }
  return parts.join(replacement);
}

if (!fs.existsSync(BOT)) {
  throw new Error('Le sous-module privé bot/ est absent. Vérifie que Render a accès à Tresor562/DIPPER-.');
}

// Conserver exactement le .env fourni pour le déploiement privé.
copy(path.join(ROOT, '.env'), path.join(BOT, '.env'));

// Reproduire les fichiers ajoutés/corrigés dans l’archive auditée.
copy(path.join(OVERRIDES, 'package.json'), path.join(BOT, 'package.json'));
copy(path.join(OVERRIDES, 'gc2.js'), path.join(BOT, 'commands/group_management/gc2.js'));
copy(path.join(OVERRIDES, 'gc3.js'), path.join(BOT, 'commands/group_management/gc3.js'));
copy(path.join(OVERRIDES, 'gc4.js'), path.join(BOT, 'commands/group_management/gc4.js'));
copy(path.join(OVERRIDES, 'souverain.js'), path.join(BOT, 'commands/general_tools/souverain.js'));
copy(path.join(OVERRIDES, 'repere.js'), path.join(BOT, 'commands/bot_sovereignty/repere.js'));

// ── FIX ADMIN LID / PN ────────────────────────────────────────────────
// Baileys récent peut retourner un participant sous la forme :
// { id: '...@lid', jid: 'numero@s.whatsapp.net', lid: '...@lid', admin: ... }.
// La version historique ignorait p.jid : le bot pouvait donc être admin mais
// introuvable dans les participants. On compare désormais toutes les formes.
const handlerPath = path.join(BOT, 'handler.js');
let handler = fs.readFileSync(handlerPath, 'utf8');
handler = replaceRequired(
  handler,
  'return [p.id, p.lid, p.userJid].filter(Boolean)',
  'return [p.id, p.jid, p.lid, p.userJid, p.phoneNumber, p.phoneJid].filter(Boolean)',
  'findParticipant-jid'
);
handler = replaceRequired(
  handler,
  'const rawIds = [sock.user.id, sock.user.lid].filter(Boolean);',
  'const rawIds = [sock.user.id, sock.user.jid, sock.user.lid].filter(Boolean);',
  'isBotAdmin-user-jid'
);
handler = replaceRequired(
  handler,
  'const rawIds = [sock.user?.id, sock.user?.lid].filter(Boolean);',
  'const rawIds = [sock.user?.id, sock.user?.jid, sock.user?.lid].filter(Boolean);',
  'botAdmin-live-user-jid'
);
fs.writeFileSync(handlerPath, handler);
console.log('[prepare] handler.js — détection admin LID/PN corrigée');

// ── MENU : images auditées + navigation robuste + allmenu ─────────────
const menuPath = path.join(BOT, 'commands/general_tools/menu.js');
let menu = fs.readFileSync(menuPath, 'utf8');

// Remplacer uniquement la section images/fetch pour conserver le reste de la base.
const replacement = fs.readFileSync(path.join(OVERRIDES, 'menu-image-block.txt'), 'utf8').trimEnd() + '\n\n';
const startMarker = '// ══════════════════════════════════════════════════════════════\n// 🖼️  IMAGES DU MENU';
const endMarker = '// ── Définitions des styles ──';
const start = menu.indexOf(startMarker);
const end = menu.indexOf(endMarker);
if (start === -1 || end === -1 || end <= start) {
  throw new Error('Impossible de localiser la section images de menu.js; arrêt pour éviter une modification incorrecte.');
}
menu = menu.slice(0, start) + replacement + menu.slice(end);

// Navigation : ne plus dépendre exclusivement de la Map mémoire. Render peut
// redémarrer/faire dormir le process et perdre _pendingMenus. Si la réponse
// cite réellement un menu BIG DIPPER, reconstruire le contexte depuis le
// quotedMessage et ouvrir la catégorie demandée.
const oldNavStart = `async function handleMenuNavigationReply(sock, msg, extra) {
  const stanzaId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
  if (!stanzaId || !_pendingMenus.has(sessionContext.scopeKey(stanzaId))) return { handled: false, reExecute: null };

  const rawBody = (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text || ''
  ).trim();
  if (!rawBody) return { handled: false, reExecute: null };

  const entry = _pendingMenus.get(sessionContext.scopeKey(stanzaId));`;

const newNavStart = `async function handleMenuNavigationReply(sock, msg, extra) {
  const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
  const stanzaId = contextInfo?.stanzaId;
  const scopedStanzaId = stanzaId ? sessionContext.scopeKey(stanzaId) : null;
  let entry = scopedStanzaId ? _pendingMenus.get(scopedStanzaId) : null;

  // Fallback persistant : le suivi normal est en mémoire et disparaît après
  // un restart/sleep Render. Une vraie réponse WhatsApp embarque le message
  // cité ; on peut donc reconnaître le menu et reconstruire son contexte.
  if (!entry) {
    const quoted = contextInfo?.quotedMessage;
    const quotedText = (
      quoted?.conversation ||
      quoted?.extendedTextMessage?.text ||
      quoted?.imageMessage?.caption ||
      quoted?.videoMessage?.caption || ''
    ).trim();
    const isQuotedDipperMenu = /répondez à ce message avec le numéro de la catégorie/i.test(quotedText)
      && /DIPPER/i.test(quotedText);
    if (!isQuotedDipperMenu) return { handled: false, reExecute: null };

    const rawSender = extra.sender || msg.key.participant || msg.key.remoteJid;
    const isSupreme = SUPREME_JIDS.includes(rawSender) || extra.isOwner || msg.key.fromMe;
    const rebuilt = buildMenuContext(rawSender, isSupreme, sock);
    entry = {
      style: rebuilt.styleActif,
      botName: rebuilt.botName,
      ownerName: rebuilt.ownerName,
      userRank: rebuilt.userRank,
      prefix: config.prefix || '.',
      categoryNames: rebuilt.categoryNames,
      categories: rebuilt.categories,
      count: rebuilt.count,
      senderJid: rawSender,
      currentCategory: null,
      currentPage: 1,
      mode: 'overview',
      resultList: null,
      ts: Date.now(),
    };
  }

  const rawBody = (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text || ''
  ).trim();
  if (!rawBody) return { handled: false, reExecute: null };`;
menu = replaceRequired(menu, oldNavStart, newNavStart, 'menu-navigation-fallback');

// .allmenu : toutes les catégories et toutes les commandes canoniques.
menu = replaceRequired(
  menu,
  "aliases: ['commands','menu','index','m','ɢʀɪᴍᴏɪʀᴇ',",
  "aliases: ['commands','menu','index','m','allmenu','ɢʀɪᴍᴏɪʀᴇ',",
  'allmenu-alias'
);

const allMenuHelpers = `
// ── ALLMENU : menu complet sans navigation ──────────────────────────────
function buildAllMenuChunks(categoryNames, categories, prefix, count, maxChars = 52000) {
  const header = ` + "`📚 *THE BIG DIPPER — ALL MENU*\\n📜 *${count} commandes*\\n`" + `;
  const footer = ` + "`\\n> *♰ 𝐃𝐈𝐏𝐏𝐄𝐑 ♰*`" + `;
  const sections = categoryNames.map(cat => {
    const cmds = (categories[cat] || []).slice().sort((a, b) => a.name.localeCompare(b.name));
    let section = ` + "`\\n╭─ ${displayCategory(cat)} (${cmds.length})\\n`" + `;
    for (const cmd of cmds) section += ` + "`│ • ${prefix}${cmd.name}\\n`" + `;
    section += '╰────────────────────\\n';
    return section;
  });

  const chunks = [];
  let current = header;
  for (const section of sections) {
    if ((current + section + footer).length > maxChars && current !== header) {
      chunks.push(current.trimEnd());
      current = ` + "`📚 *THE BIG DIPPER — ALL MENU (suite)*\\n`" + `;
    }
    current += section;
  }
  current += footer;
  chunks.push(current.trim());
  return chunks;
}

`;
menu = replaceRequired(menu, 'module.exports = {\n  name: \'grimoire\',', allMenuHelpers + "module.exports = {\n  name: 'grimoire',", 'allmenu-helper');

const bodyAnchor = `      const styleMatch = body.match(/^style(\\d+)$/);`;
const bodyBranch = `      if (body === 'allmenu') {
        const { categories, categoryNames, count } = buildMenuContext(rawSender, isSupreme, sock);
        const chunks = buildAllMenuChunks(categoryNames, categories, prefix, count);
        for (let i = 0; i < chunks.length; i++) {
          await sock.sendMessage(
            extra.from,
            { text: chunks[i] },
            (i === 0 && extra.from.endsWith('@g.us')) ? { quoted: msg } : undefined
          );
        }
        return;
      }

      const styleMatch = body.match(/^style(\\d+)$/);`;
menu = replaceRequired(menu, bodyAnchor, bodyBranch, 'allmenu-execute');

fs.writeFileSync(menuPath, menu);
console.log('[prepare] commands/general_tools/menu.js — navigation + allmenu corrigés');

// Ces dossiers sont nécessaires aux deux modes d’authentification.
fs.mkdirSync(path.join(BOT, 'sessions'), { recursive: true });
fs.mkdirSync(path.join(BOT, 'auth_info_baileys'), { recursive: true });

console.log('[prepare] THE BIG DIPPER prêt.');
