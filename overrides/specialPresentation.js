'use strict';

const config = require('../config');
const styleManager = require('./styleManager');
const sharp = require('sharp');
const axios = require('axios');
const {
  proto,
  prepareWAMessageMedia,
  generateWAMessageFromContent,
} = require('@whiskeysockets/baileys');

const OWNER_PHONE = '2290146202259';
const OWNER_NAME = '🌹 Mr Tresor 🌹';
const BOT_TITLE = 'THE BIG DIPPER';
const BOT_URL = 'https://the-big-dipper.onrender.com';
const DEFAULT_STYLE_IMAGE = 'https://files.catbox.moe/1k8r1f.jpg';
const NEXUS_CHANNEL_URL = 'https://whatsapp.com/channel/0029VbDkWGYHltYHGr1HHQ07';
const OTAKU_CHANNEL_URL = 'https://whatsapp.com/channel/0029VbCKhnq7j6gEhuUKMP1V';
const SUPPORT_GROUP_URL = 'https://chat.whatsapp.com/Dm7yX11U7vmCCFM240sNKq?s=cl&p=a&ilr=1';

const SPECIAL_COMMANDS = new Set([
  'menu', 'grimoire', 'allmenu', 'commands', 'index', 'menu2', 'help',
  'ping', 'alive', 'uptime', 'botinfo', 'botstatus', 'info', 'status', 'presence',
  'repere', 'repère', 'owner', 'support', 'freebot', 'about', 'channelid',
  'pair', 'sessions', 'session', 'mode', 'prefix', 'setprefix', 'setmode',
  'setbotname', 'setmenuimage', 'setnewsletter', 'update',
]);

const normalizeCommandName = name => String(name || '').trim().toLowerCase();
const isSpecialCommand = name => SPECIAL_COMMANDS.has(normalizeCommandName(name));

function buildOwnerVcard() {
  return ['BEGIN:VCARD','VERSION:3.0',`FN:${OWNER_NAME}`,'N:Tresor;Mr;;;',`TEL;type=CELL;type=VOICE;waid=${OWNER_PHONE}:+${OWNER_PHONE}`,`URL:https://wa.me/${OWNER_PHONE}`,'END:VCARD'].join('\n');
}

function buildOwnerQuotedMessage(jid) {
  const ownerJid = `${OWNER_PHONE}@s.whatsapp.net`;
  return {
    key: { remoteJid: jid, fromMe: false, id: `DIPPER_OWNER_${Date.now()}`, ...(String(jid || '').endsWith('@g.us') ? { participant: ownerJid } : {}) },
    message: { contactMessage: { displayName: OWNER_NAME, vcard: buildOwnerVcard() } },
    pushName: OWNER_NAME,
  };
}

function buildButtons() {
  return [
    { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: '📢 Voir Nexus Tech', url: NEXUS_CHANNEL_URL, merchant_url: NEXUS_CHANNEL_URL }) },
    { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: '🖤 Voir Otaku Nexus', url: OTAKU_CHANNEL_URL, merchant_url: OTAKU_CHANNEL_URL }) },
    { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: '🛠️ Groupe Support', url: SUPPORT_GROUP_URL, merchant_url: SUPPORT_GROUP_URL }) },
  ];
}

function buildBizNodes(jid) {
  const bizNode = { tag: 'biz', attrs: { actual_actors: '2', host_storage: '2', privacy_mode_ts: String(Math.floor(Date.now() / 1000) - 77980457) }, content: [
    { tag: 'interactive', attrs: { type: 'native_flow', v: '1' }, content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }] },
    { tag: 'quality_control', attrs: { source_type: 'third_party' } },
  ] };
  return String(jid || '').endsWith('@g.us') ? [bizNode] : [{ tag: 'bot', attrs: { biz_bot: '1' } }, bizNode];
}

async function resolveImageBuffer(style, provided) {
  if (Buffer.isBuffer(provided) && provided.length > 256) return provided;
  try {
    const menu = require('../commands/general_tools/menu');
    if (typeof menu.getImageBufferForStyle === 'function') {
      const buf = await menu.getImageBufferForStyle(style);
      if (Buffer.isBuffer(buf) && buf.length > 256) return buf;
    }
  } catch (_) {}
  try {
    const res = await axios.get(DEFAULT_STYLE_IMAGE, { responseType: 'arraybuffer', timeout: 7000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const buf = Buffer.from(res.data || []);
    if (buf.length > 256) return buf;
  } catch (err) {
    console.warn('[special-presentation] fallback image indisponible:', err.message);
  }
  return null;
}

async function makePreviewThumbnail(imageBuffer) {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length < 256) return null;
  try { return await sharp(imageBuffer).resize(320, 320, { fit: 'cover', position: 'centre', withoutEnlargement: true }).jpeg({ quality: 72, mozjpeg: true }).toBuffer(); }
  catch (_) { return imageBuffer.length <= 120 * 1024 ? imageBuffer : null; }
}

function getNewsletterContext(thumbnail) {
  const contextInfo = {
    forwardingScore: 999,
    isForwarded: true,
    forwardedNewsletterMessageInfo: { newsletterJid: config.newsletterJid || '120363411005383995@newsletter', newsletterName: config.botName || BOT_TITLE, serverMessageId: -1 },
    externalAdReply: { showAdAttribution: false, title: BOT_TITLE, body: 'Powered by 🌹 Mr Tresor 🌹', mediaType: 1, sourceUrl: BOT_URL, mediaUrl: BOT_URL, renderLargerThumbnail: true },
  };
  if (Buffer.isBuffer(thumbnail) && thumbnail.length > 1000) contextInfo.externalAdReply.thumbnail = thumbnail;
  return contextInfo;
}

async function buildMediaHeader(sock, imageBuffer) {
  let header = proto.Message.InteractiveMessage.Header.create({ title: '', subtitle: '', hasMediaAttachment: false });
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length < 256) return header;
  try {
    const prepared = await prepareWAMessageMedia({ image: imageBuffer }, { upload: sock.waUploadToServer });
    header = proto.Message.InteractiveMessage.Header.create({ ...prepared, title: '', subtitle: '', hasMediaAttachment: true });
  } catch (err) {
    console.warn('[special-presentation] image menu non uploadée, carte conservée:', err.message);
  }
  return header;
}

async function sendSpecialPresentation(sock, jid, options = {}) {
  const { text = '', style = styleManager.getStyle(), imageBuffer = null, commandName = '' } = options;
  const effectiveImage = await resolveImageBuffer(style, imageBuffer);
  const thumbnail = await makePreviewThumbnail(effectiveImage);
  const header = await buildMediaHeader(sock, effectiveImage);

  const interactiveMessage = proto.Message.InteractiveMessage.create({
    body: proto.Message.InteractiveMessage.Body.create({ text: String(text || '') }),
    footer: proto.Message.InteractiveMessage.Footer.create({ text: '' }),
    header,
    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({ buttons: buildButtons(), messageParamsJson: '{}', messageVersion: 1 }),
    contextInfo: getNewsletterContext(thumbnail),
  });

  const generated = generateWAMessageFromContent(jid, { interactiveMessage }, { quoted: buildOwnerQuotedMessage(jid), userJid: sock.user?.id });
  await sock.relayMessage(jid, generated.message, { messageId: generated.key.id, additionalNodes: buildBizNodes(jid) });
  console.log(`[special-presentation] ✅ ${normalizeCommandName(commandName) || 'special'} | style=${style} | image=${header?.hasMediaAttachment ? 'yes' : 'no'} | jid=${jid}`);
  return generated;
}

module.exports = { OWNER_PHONE, OWNER_NAME, BOT_TITLE, BOT_URL, SPECIAL_COMMANDS, isSpecialCommand, sendSpecialPresentation };
