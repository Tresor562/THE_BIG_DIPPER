'use strict';

const config = require('../../config');
const { proto, generateWAMessageFromContent } = require('@whiskeysockets/baileys');

const OWNER_NAME = '🌹 Mr Tresor 🌹';
const OWNER_NUMBERS = ['2290146202259', '2290155745907'];
const BOT_URL = 'https://the-big-dipper.onrender.com';
const TELEGRAM_URL = 'https://t.me/tresor20001';
const FACEBOOK_URL = 'https://www.facebook.com/profile.php?id=100078681750878';
const TIKTOK_URL = String(process.env.OWNER_TIKTOK_URL || '').trim();
const INSTAGRAM_URL = String(process.env.OWNER_INSTAGRAM_URL || '').trim();
const NEXUS_TECH_URL = 'https://whatsapp.com/channel/0029VbDkWGYHltYHGr1HHQ07';
const FOOTER = '> Powered by 🌹 Mr Tresor 🌹';

function validUrl(url) {
  return /^https?:\/\/[^\s]+$/i.test(String(url || '').trim());
}

function buildVcard(number) {
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${OWNER_NAME}`,
    'N:Tresor;Mr;;;',
    'ORG:THE BIG DIPPER / Nexus Tech;',
    'TITLE:Creator & Developer',
    `TEL;type=CELL;type=VOICE;waid=${number}:+${number}`,
    `URL;type=WHATSAPP:https://wa.me/${number}`,
    `URL;type=TELEGRAM:${TELEGRAM_URL}`,
    'END:VCARD',
  ].join('\n');
}

function buildQuotedContact(jid, number) {
  const ownerJid = `${number}@s.whatsapp.net`;
  return {
    key: {
      remoteJid: jid,
      fromMe: false,
      id: `DIPPER_OWNER_${number}_${Date.now()}`,
      ...(String(jid || '').endsWith('@g.us') ? { participant: ownerJid } : {}),
    },
    message: { contactMessage: { displayName: OWNER_NAME, vcard: buildVcard(number) } },
    pushName: OWNER_NAME,
  };
}

function urlButton(label, url) {
  if (!validUrl(url)) return null;
  return {
    name: 'cta_url',
    buttonParamsJson: JSON.stringify({ display_text: label, url, merchant_url: url }),
  };
}

function buildButtons(number) {
  return [
    urlButton('💬 Message', `https://wa.me/${number}`),
    urlButton('✈️ Telegram', TELEGRAM_URL),
    urlButton('📘 Facebook', FACEBOOK_URL),
    urlButton('🎵 TikTok', TIKTOK_URL),
    urlButton('📸 Instagram', INSTAGRAM_URL),
    urlButton('📢 Nexus Tech', NEXUS_TECH_URL),
  ].filter(Boolean);
}

function buildBizNodes(jid) {
  const bizNode = {
    tag: 'biz',
    attrs: {
      actual_actors: '2',
      host_storage: '2',
      privacy_mode_ts: String(Math.floor(Date.now() / 1000) - 77980457),
    },
    content: [
      { tag: 'interactive', attrs: { type: 'native_flow', v: '1' }, content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }] },
      { tag: 'quality_control', attrs: { source_type: 'third_party' } },
    ],
  };
  return String(jid || '').endsWith('@g.us') ? [bizNode] : [{ tag: 'bot', attrs: { biz_bot: '1' } }, bizNode];
}

function getNewsletterContext(number) {
  return {
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
      body: `Contact officiel • +${number}`,
      mediaType: 1,
      sourceUrl: BOT_URL,
      mediaUrl: BOT_URL,
      renderLargerThumbnail: false,
    },
  };
}

async function sendOwnerCard(sock, jid, number) {
  const text =
    `╭─❑ *OWNER • THE BIG DIPPER* ❑─⚯\n` +
    `┃🌹 *${OWNER_NAME}*\n` +
    `┃📱 *+${number}*\n` +
    `┃💬 Appuie sur *Message* pour ouvrir directement le DM WhatsApp.\n` +
    `╰━━━━━━━━━━━━━━━⚯\n\n${FOOTER}`;

  const interactiveMessage = proto.Message.InteractiveMessage.create({
    body: proto.Message.InteractiveMessage.Body.create({ text }),
    footer: proto.Message.InteractiveMessage.Footer.create({ text: '' }),
    header: proto.Message.InteractiveMessage.Header.create({ title: '', subtitle: '', hasMediaAttachment: false }),
    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
      buttons: buildButtons(number),
      messageParamsJson: '{}',
      messageVersion: 1,
    }),
    contextInfo: getNewsletterContext(number),
  });

  const generated = generateWAMessageFromContent(
    jid,
    { interactiveMessage },
    { quoted: buildQuotedContact(jid, number), userJid: sock.user?.id }
  );

  await sock.relayMessage(jid, generated.message, {
    messageId: generated.key.id,
    additionalNodes: buildBizNodes(jid),
  });
  return generated;
}

module.exports = {
  name: 'owner',
  aliases: ['souverain', 'creator', 'souverain_dev', 'developpeur', 'maitre', 'developper', 'architecte', 'king'],
  category: '🛠️ Outils généraux',
  description: 'Affiche les deux contacts officiels de THE BIG DIPPER et les réseaux de Mr Tresor.',
  usage: `${config.prefix || '.'}owner`,
  ownerOnly: false,
  groupOnly: false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const jid = extra?.from || msg?.key?.remoteJid;
    if (!jid) return;
    try {
      for (const number of OWNER_NUMBERS) await sendOwnerCard(sock, jid, number);
      try { await sock.sendMessage(jid, { react: { text: '🌹', key: msg.key } }); } catch (_) {}
    } catch (error) {
      console.error('[owner] envoi premium échoué:', error.message);
      return extra.reply(`❌ Impossible d'afficher les contacts pour le moment.\n\n${FOOTER}`);
    }
  },
};
