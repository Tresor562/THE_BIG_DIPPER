'use strict';

const config = require('../../config');
const { proto, generateWAMessageFromContent } = require('@whiskeysockets/baileys');
const { resolveOwnerProfileThumbnail } = require('../../utils/specialPresentation');

const OWNER_NAME = '𝐌ꝛ⥔𝕿𝖗𝖊𝖘𝖔𝖗 🌹';
const OWNER_PHONE = '2290146202259';
const BOT_URL = 'https://the-big-dipper.onrender.com';
const TELEGRAM_URL = 'https://t.me/tresor20009';
const FACEBOOK_URL = 'https://www.facebook.com/profile.php?id=100078681750878';
const TIKTOK_URL = 'https://www.tiktok.com/@tresor20001';
const INSTAGRAM_URL = 'https://www.instagram.com/tresorhtn';
const NEXUS_TECH_URL = 'https://whatsapp.com/channel/0029VbDkWGYHltYHGr1HHQ07';
const FOOTER = '> Powered by 🌹 Mr Tresor 🌹';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function buildVcard() {
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${OWNER_NAME}`,
    'N:Tresor;Mr;;;',
    'ORG:THE BIG DIPPER / Nexus Tech;',
    'TITLE:Creator & Developer',
    `TEL;type=CELL;type=VOICE;waid=${OWNER_PHONE}:+${OWNER_PHONE}`,
    `URL;type=WHATSAPP:https://wa.me/${OWNER_PHONE}`,
    `URL;type=TELEGRAM:${TELEGRAM_URL}`,
    `URL;type=FACEBOOK:${FACEBOOK_URL}`,
    `URL;type=TIKTOK:${TIKTOK_URL}`,
    `URL;type=INSTAGRAM:${INSTAGRAM_URL}`,
    'END:VCARD',
  ].join('\n');
}

function buildSyntheticContact(jid) {
  const ownerJid = `${OWNER_PHONE}@s.whatsapp.net`;
  return {
    key: {
      remoteJid: jid,
      fromMe: false,
      id: `DIPPER_CREATOR_${Date.now()}`,
      ...(String(jid || '').endsWith('@g.us') ? { participant: ownerJid } : {}),
    },
    message: { contactMessage: { displayName: OWNER_NAME, vcard: buildVcard() } },
    pushName: OWNER_NAME,
  };
}

function urlButton(label, url) {
  return { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: label, url, merchant_url: url }) };
}

function buildButtons() {
  return [
    urlButton('💬 Message', `https://wa.me/${OWNER_PHONE}`),
    urlButton('✈️ Telegram', TELEGRAM_URL),
    urlButton('📘 Facebook', FACEBOOK_URL),
    urlButton('🎵 TikTok', TIKTOK_URL),
    urlButton('📸 Instagram', INSTAGRAM_URL),
    urlButton('📢 Nexus Tech', NEXUS_TECH_URL),
  ];
}

function buildBizNodes(jid) {
  const bizNode = {
    tag: 'biz',
    attrs: { actual_actors: '2', host_storage: '2', privacy_mode_ts: String(Math.floor(Date.now() / 1000) - 77980457) },
    content: [
      { tag: 'interactive', attrs: { type: 'native_flow', v: '1' }, content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }] },
      { tag: 'quality_control', attrs: { source_type: 'third_party' } },
    ],
  };
  return String(jid || '').endsWith('@g.us') ? [bizNode] : [{ tag: 'bot', attrs: { biz_bot: '1' } }, bizNode];
}

function getNewsletterContext(thumbnail, body = 'Créateur officiel • THE BIG DIPPER') {
  const contextInfo = {
    forwardingScore: 999,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid: config.newsletterJid || '120363411005383995@newsletter',
      newsletterName: config.botName || 'THE BIG DIPPER',
      serverMessageId: -1,
    },
    externalAdReply: {
      showAdAttribution: false,
      title: 'THE BIG DIPPER',
      body,
      mediaType: 1,
      sourceUrl: BOT_URL,
      mediaUrl: BOT_URL,
      renderLargerThumbnail: false,
    },
  };
  if (Buffer.isBuffer(thumbnail) && thumbnail.length > 1000) contextInfo.externalAdReply.thumbnail = thumbnail;
  return contextInfo;
}

async function sendCreatorArrival(sock, jid, msg, thumbnail) {
  const text =
    `╭━━❑ *ARRIVÉE DU CRÉATEUR* ❑━━⚯\n` +
    `┃👑 Silence et respect.\n` +
    `┃🌹 *${OWNER_NAME}* entre dans le sanctuaire.\n` +
    `┃🛐 Respect absolu, loyauté sans faille et soumission totale à son autorité.\n` +
    `┃⚜️ Le créateur de *THE BIG DIPPER* est présent.\n` +
    `╰━━━━━━━━━━━━━━━⚯\n\n${FOOTER}`;
  return sock.sendMessage(jid, { text, contextInfo: getNewsletterContext(thumbnail, 'Arrivée du créateur') }, { quoted: msg });
}

// Vraie carte Contact WhatsApp : ce n'est pas seulement du texte ni une quote simulée.
async function sendActualVcard(sock, jid, msg, thumbnail) {
  return sock.sendMessage(
    jid,
    {
      contacts: {
        displayName: OWNER_NAME,
        contacts: [{ displayName: OWNER_NAME, vcard: buildVcard() }],
      },
      contextInfo: getNewsletterContext(thumbnail, 'Contact officiel du créateur'),
    },
    { quoted: msg }
  );
}

async function sendOwnerActions(sock, jid, thumbnail, contactMessage) {
  const text =
    `╭─❑ *CRÉATEUR • THE BIG DIPPER* ❑─⚯\n` +
    `┃🌹 *${OWNER_NAME}*\n` +
    `┃📱 *+${OWNER_PHONE}*\n` +
    `┃💬 Appuie sur *Message* pour ouvrir directement son DM WhatsApp.\n` +
    `╰━━━━━━━━━━━━━━━⚯\n\n${FOOTER}`;

  const interactiveMessage = proto.Message.InteractiveMessage.create({
    body: proto.Message.InteractiveMessage.Body.create({ text }),
    footer: proto.Message.InteractiveMessage.Footer.create({ text: '' }),
    header: proto.Message.InteractiveMessage.Header.create({ title: '', subtitle: '', hasMediaAttachment: false }),
    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({ buttons: buildButtons(), messageParamsJson: '{}', messageVersion: 1 }),
    contextInfo: getNewsletterContext(thumbnail),
  });

  const generated = generateWAMessageFromContent(
    jid,
    { interactiveMessage },
    { quoted: contactMessage || buildSyntheticContact(jid), userJid: sock.user?.id }
  );
  await sock.relayMessage(jid, generated.message, { messageId: generated.key.id, additionalNodes: buildBizNodes(jid) });
  return generated;
}

module.exports = {
  name: 'owner',
  aliases: ['souverain', 'creator', 'souverain_dev', 'developpeur', 'maitre', 'developper', 'architecte', 'king'],
  category: '🛠️ Outils généraux',
  description: 'Affiche la vraie vCard et les réseaux officiels du créateur de THE BIG DIPPER.',
  usage: `${config.prefix || '.'}owner`,
  ownerOnly: false,
  groupOnly: false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const jid = extra?.from || msg?.key?.remoteJid;
    if (!jid) return;
    try {
      const thumbnail = await resolveOwnerProfileThumbnail(sock).catch(() => null);
      await sendCreatorArrival(sock, jid, msg, thumbnail);
      await wait(2200);
      const vcardMessage = await sendActualVcard(sock, jid, msg, thumbnail);
      await wait(450);
      const sent = await sendOwnerActions(sock, jid, thumbnail, vcardMessage);
      try { await sock.sendMessage(jid, { react: { text: '🌹', key: msg.key } }); } catch (_) {}
      return sent;
    } catch (error) {
      console.error('[owner] envoi premium échoué:', error.message);
      return extra.reply(`❌ Impossible d'afficher le contact du créateur pour le moment.\n\n${FOOTER}`);
    }
  },
};
