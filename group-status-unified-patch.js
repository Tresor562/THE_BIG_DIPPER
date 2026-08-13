'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BOT = path.join(__dirname, 'bot');
const utilsDir = path.join(BOT, 'utils');
const cmdDir = path.join(BOT, 'commands', 'group_management');
if (!fs.existsSync(cmdDir)) throw new Error('[group-status-unified] group_management absent');
fs.mkdirSync(utilsDir, { recursive: true });

const engine = `'use strict';
const crypto = require('crypto');
const {
  proto,
  generateWAMessageContent,
  generateWAMessageFromContent,
  downloadContentFromMessage,
} = require('@whiskeysockets/baileys');

const COLORS = {
  purple: 0xFF9C27B0,
  violet: 0xFF7B1FA2,
  pink: 0xFFE91E63,
  red: 0xFFF44336,
  orange: 0xFFFF5722,
  yellow: 0xFFFFC107,
  green: 0xFF4CAF50,
  teal: 0xFF009688,
  cyan: 0xFF00BCD4,
  blue: 0xFF2196F3,
  indigo: 0xFF3F51B5,
  black: 0xFF212121,
  white: 0xFFFFFFFF,
  grey: 0xFF607D8B,
  brown: 0xFF795548,
  gold: 0xFFF9A825,
};
const DEFAULT_COLOR = COLORS.purple;

function getPrefs() {
  try { return require('./sessionPreferences'); } catch { return null; }
}
function colorKey(groupId) { return 'groupStatusColor:' + String(groupId || ''); }
function getColor(groupId) {
  const prefs = getPrefs();
  const value = Number(prefs?.get?.(colorKey(groupId), DEFAULT_COLOR));
  return Number.isFinite(value) ? value : DEFAULT_COLOR;
}
function setColor(groupId, value) {
  const prefs = getPrefs();
  if (prefs?.set) prefs.set(colorKey(groupId), Number(value));
}
function resetColor(groupId) {
  const prefs = getPrefs();
  if (prefs?.set) prefs.set(colorKey(groupId), DEFAULT_COLOR);
}

function unwrapMessage(message) {
  let cur = message || {};
  for (let i = 0; i < 8; i++) {
    const next =
      cur.ephemeralMessage?.message ||
      cur.viewOnceMessage?.message ||
      cur.viewOnceMessageV2?.message ||
      cur.viewOnceMessageV2Extension?.message ||
      cur.documentWithCaptionMessage?.message ||
      null;
    if (!next) break;
    cur = next;
  }
  return cur || {};
}

function findQuoted(message) {
  const root = unwrapMessage(message);
  const candidates = [root];
  for (const value of Object.values(root)) {
    if (value && typeof value === 'object') candidates.push(value);
  }
  for (const node of candidates) {
    const ctx = node?.contextInfo;
    if (ctx?.quotedMessage) return unwrapMessage(ctx.quotedMessage);
  }
  return null;
}

function quotedText(q) {
  if (!q) return '';
  return String(q.conversation || q.extendedTextMessage?.text || '').trim();
}

async function download(media, type) {
  const stream = await downloadContentFromMessage(media, type);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);
  if (!buffer.length) throw new Error('média cité vide ou expiré');
  return buffer;
}

async function payloadFromQuoted(q, caption) {
  if (!q) return null;
  if (q.imageMessage) {
    return { image: await download(q.imageMessage, 'image'), caption: caption || q.imageMessage.caption || '' };
  }
  if (q.videoMessage) {
    return { video: await download(q.videoMessage, 'video'), caption: caption || q.videoMessage.caption || '', gifPlayback: !!q.videoMessage.gifPlayback };
  }
  if (q.audioMessage) {
    return {
      audio: await download(q.audioMessage, 'audio'),
      mimetype: q.audioMessage.mimetype || 'audio/mpeg',
      ptt: !!q.audioMessage.ptt,
    };
  }
  if (q.stickerMessage) {
    const raw = await download(q.stickerMessage, 'sticker');
    let image = raw;
    try { image = await require('sharp')(raw).png().toBuffer(); } catch (_) {}
    return { image, caption: caption || '' };
  }
  const text = caption || quotedText(q);
  return text ? { text } : null;
}

function describePayload(payload) {
  if (payload?.image) return 'image';
  if (payload?.video) return 'video';
  if (payload?.audio) return 'audio';
  return 'texte';
}

async function relayManual(sock, groupId, payload, color) {
  let inside;
  if (payload.text) {
    inside = {
      extendedTextMessage: {
        text: String(payload.text),
        backgroundArgb: Number(color) >>> 0,
        textArgb: 0xFFFFFFFF,
        font: 2,
        previewType: 0,
      },
    };
  } else {
    inside = await generateWAMessageContent(payload, { upload: sock.waUploadToServer });
  }

  const messageSecret = crypto.randomBytes(32);
  const content = proto.Message.fromObject({
    messageContextInfo: { messageSecret },
    groupStatusMessageV2: {
      message: {
        ...inside,
        messageContextInfo: { messageSecret },
      },
    },
  });

  const waMessage = generateWAMessageFromContent(groupId, content, {
    userJid: sock.user?.id,
  });
  if (!waMessage?.message || !waMessage?.key?.id) throw new Error('génération groupStatusMessageV2 invalide');

  await sock.relayMessage(groupId, waMessage.message, { messageId: waMessage.key.id });
  return { route: 'relayMessage', messageId: waMessage.key.id, message: waMessage };
}

async function sendGroupStatus(sock, groupId, payload, color) {
  if (!groupId?.endsWith('@g.us')) throw new Error('JID groupe invalide');
  if (!sock?.user?.id) throw new Error('socket WhatsApp non connecté');

  // Compatibilité ascendante : les versions/forks qui exposent une API dédiée
  // doivent être préférées. Baileys 6.7.22 utilise le fallback protobuf ci-dessous.
  if (typeof sock.sendGroupStatus === 'function') {
    const result = await sock.sendGroupStatus([groupId], payload);
    return { route: 'sendGroupStatus', messageId: result?.key?.id || null, message: result };
  }
  return relayManual(sock, groupId, payload, color);
}

function usage(prefix, commandName) {
  return [
    '📢 *STATUT DE GROUPE*',
    '',
    '• ' + prefix + commandName + ' votre texte',
    '• répondre à une image/vidéo/audio/sticker avec ' + prefix + commandName,
    '• ' + prefix + commandName + ' color blue',
    '• ' + prefix + commandName + ' color reset',
  ].join('\\n');
}

async function execute(commandName, sock, msg, args, extra) {
  const groupId = extra?.from || msg?.key?.remoteJid;
  const prefix = String(extra?.prefix || '.');
  if (!groupId?.endsWith('@g.us')) return extra.reply('👥 Cette commande fonctionne uniquement dans un groupe.');

  const words = Array.isArray(args) ? args : [];
  if (String(words[0] || '').toLowerCase() === 'color') {
    const value = String(words[1] || '').toLowerCase();
    if (!value) return extra.reply('🎨 Couleurs: ' + Object.keys(COLORS).join(', ') + '.');
    if (value === 'reset') {
      resetColor(groupId);
      return extra.reply('✅ Couleur des statuts du groupe réinitialisée.');
    }
    if (!COLORS[value]) return extra.reply('❌ Couleur inconnue. Disponibles: ' + Object.keys(COLORS).join(', ') + '.');
    setColor(groupId, COLORS[value]);
    return extra.reply('✅ Couleur des statuts du groupe: ' + value + '.');
  }

  const caption = words.join(' ').trim();
  const quoted = findQuoted(msg?.message);
  let payload = quoted ? await payloadFromQuoted(quoted, caption) : null;
  if (!payload && caption) payload = { text: caption };
  if (!payload) return extra.reply(usage(prefix, commandName === 'groupstatus4' ? 'gc4' : commandName));

  const type = describePayload(payload);
  try {
    await extra.reply('⏳ Publication du statut de groupe (' + type + ')…');
    const result = await sendGroupStatus(sock, groupId, payload, getColor(groupId));
    console.log('[group-status-engine]', {
      command: commandName,
      groupId,
      type,
      route: result.route,
      messageId: result.messageId,
    });
    return extra.reply('✅ Statut de groupe ' + type + ' publié.');
  } catch (error) {
    const code = error?.output?.statusCode || error?.data?.statusCode || error?.statusCode || error?.code || '';
    console.error('[group-status-engine] échec', commandName, groupId, code, error?.stack || error);
    return extra.reply('❌ Échec du statut de groupe' + (code ? ' [' + code + ']' : '') + ': ' + (error?.message || String(error)));
  }
}

module.exports = { COLORS, findQuoted, payloadFromQuoted, sendGroupStatus, execute };
`;

fs.writeFileSync(path.join(utilsDir, 'groupStatusEngine.js'), engine, 'utf8');

const defs = [
  { file: 'groupstatus.js', name: 'groupstatus', aliases: ['gs','gcstatus','groupestatuts','togstatus','gstatus','swgc'] },
  { file: 'gc.js', name: 'gc', aliases: [] },
  { file: 'gc2.js', name: 'gc2', aliases: ['upswgc'] },
  { file: 'gc3.js', name: 'gc3', aliases: ['gcstatus3'] },
  { file: 'gc4.js', name: 'groupstatus4', aliases: ['gc4'] },
];

for (const def of defs) {
  const src = `'use strict';\nconst engine = require('../../utils/groupStatusEngine');\nmodule.exports = {\n  name: ${JSON.stringify(def.name)},\n  aliases: ${JSON.stringify(def.aliases)},\n  category: '⚙️ Gestion de groupe',\n  description: 'Publie texte ou média comme statut de groupe WhatsApp.',\n  usage: '.${def.name === 'groupstatus4' ? 'gc4' : def.name} <texte> | répondre à un média',\n  groupOnly: true,\n  adminOnly: true,\n  botAdminNeeded: false,\n  async execute(sock, msg, args, extra) {\n    return engine.execute(${JSON.stringify(def.name)}, sock, msg, args, extra);\n  },\n};\n`;
  fs.writeFileSync(path.join(cmdDir, def.file), src, 'utf8');
}

const checks = [path.join(utilsDir,'groupStatusEngine.js'), ...defs.map(d => path.join(cmdDir,d.file))];
for (const file of checks) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('[group-status-unified] syntaxe ' + path.basename(file) + ': ' + (result.stderr || result.stdout));
}

// Test statique du routing et des permissions : cinq commandes distinctes,
// aliases uniques, pas de besoin bot-admin, même moteur final.
const seen = new Set();
for (const def of defs) {
  for (const token of [def.name, ...def.aliases]) {
    const key = String(token).toLowerCase();
    if (seen.has(key)) throw new Error('[group-status-unified] collision token: ' + key);
    seen.add(key);
  }
  const final = fs.readFileSync(path.join(cmdDir, def.file), 'utf8');
  if (!final.includes("require('../../utils/groupStatusEngine')")) throw new Error('[group-status-unified] moteur absent: ' + def.file);
  if (!final.includes('botAdminNeeded: false')) throw new Error('[group-status-unified] botAdminNeeded invalide: ' + def.file);
}
console.log('[group-status-unified] ✅ groupstatus/gc/gc2/gc3/gc4 unifiés et vérifiés');
