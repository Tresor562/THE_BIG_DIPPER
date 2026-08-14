'use strict';

const config = require('../config');
const styleManager = require('./styleManager');
const {
  proto,
  generateWAMessageFromContent,
} = require('@whiskeysockets/baileys');

const OWNER_PHONE = '2290146202259';
const OWNER_NAME = '🌹 Mr Tresor 🌹';
const BOT_TITLE = 'THE BIG DIPPER';
const BOT_URL = 'https://the-big-dipper.onrender.com';
const NEXUS_CHANNEL_URL = 'https://whatsapp.com/channel/0029VbDkWGYHltYHGr1HHQ07';
const OTAKU_CHANNEL_URL = 'https://whatsapp.com/channel/0029VbCKhnq7j6gEhuUKMP1V';
const SUPPORT_GROUP_URL = 'https://chat.whatsapp.com/Dm7yX11U7vmCCFM240sNKq?s=cl&p=a&ilr=1';

// Commandes d'identité, de navigation et d'état considérées comme « spéciales ».
// Le registre est volontairement central : ajouter un nom ici suffit pour que
// les réponses texte de cette commande reçoivent la même enveloppe premium.
const SPECIAL_COMMANDS = new Set([
  'menu', 'grimoire', 'allmenu', 'commands', 'index', 'menu2', 'help',
  'ping', 'alive', 'uptime', 'botinfo', 'info', 'status',
  'repere', 'repère', 'owner', 'support', 'freebot', 'about',
  'pair', 'sessions', 'session', 'setprefix', 'setmode',
]);

function normalizeCommandName(name) {
  return String(name || '').trim().toLowerCase();
}

function isSpecialCommand(name) {
  return SPECIAL_COMMANDS.has(normalizeCommandName(name));
}

function buildOwnerVcard() {
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${OWNER_NAME}`,
    `N:Tresor;Mr;;;`,
    `TEL;type=CELL;type=VOICE;waid=${OWNER_PHONE}:+${OWNER_PHONE}`,
    `URL:https://wa.me/${OWNER_PHONE}`,
    'END:VCARD',
  ].join('\n');
}

function buildOwnerQuotedMessage(jid) {
  const ownerJid = `${OWNER_PHONE}@s.whatsapp.net`;
  return {
    key: {
      remoteJid: jid,
      fromMe: false,
      id: `DIPPER_OWNER_${Date.now()}`,
      ...(String(jid || '').endsWith('@g.us') ? { participant: ownerJid } : {}),
    },
    message: {
      contactMessage: {
        displayName: OWNER_NAME,
        vcard: buildOwnerVcard(),
      },
    },
    pushName: OWNER_NAME,
  };
}

function buildButtons() {
  return [
    {
      name: 'cta_url',
      buttonParamsJson: JSON.stringify({
        display_text: '📢 Voir Nexus Tech',
        url: NEXUS_CHANNEL_URL,
        merchant_url: NEXUS_CHANNEL_URL,
      }),
    },
    {
      name: 'cta_url',
      buttonParamsJson: JSON.stringify({
        display_text: '🖤 Voir Otaku Nexus',
        url: OTAKU_CHANNEL_URL,
        merchant_url: OTAKU_CHANNEL_URL,
      }),
    },
    {
      name: 'cta_url',
      buttonParamsJson: JSON.stringify({
        display_text: '🛠️ Groupe Support',
        url: SUPPORT_GROUP_URL,
        merchant_url: SUPPORT_GROUP_URL,
      }),
    },
  ];
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
      {
        tag: 'interactive',
        attrs: { type: 'native_flow', v: '1' },
        content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
      },
      { tag: 'quality_control', attrs: { source_type: 'third_party' } },
    ],
  };
  return String(jid || '').endsWith('@g.us')
    ? [bizNode]
    : [{ tag: 'bot', attrs: { biz_bot: '1' } }, bizNode];
}

function getNewsletterContext(imageBuffer) {
  const contextInfo = {
    forwardingScore: 999,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid: config.newsletterJid || '120363411005383995@newsletter',
      newsletterName: config.botName || BOT_TITLE,
      serverMessageId: -1,
    },
    externalAdReply: {
      showAdAttribution: false,
      title: BOT_TITLE,
      body: 'Powered by 🌹 Mr Tresor 🌹',
      mediaType: 1,
      sourceUrl: BOT_URL,
      mediaUrl: BOT_URL,
      renderLargerThumbnail: true,
    },
  };
  if (Buffer.isBuffer(imageBuffer) && imageBuffer.length > 1000) {
    contextInfo.externalAdReply.thumbnail = imageBuffer;
  }
  return contextInfo;
}

async function sendSpecialPresentation(sock, jid, options = {}) {
  const {
    text = '',
    style = styleManager.getStyle(),
    imageBuffer = null,
    commandName = '',
  } = options;

  const contextInfo = getNewsletterContext(imageBuffer);
  const interactiveMessage = proto.Message.InteractiveMessage.create({
    body: proto.Message.InteractiveMessage.Body.create({ text: String(text || '') }),
    footer: proto.Message.InteractiveMessage.Footer.create({ text: '' }),
    header: proto.Message.InteractiveMessage.Header.create({
      title: '',
      subtitle: '',
      hasMediaAttachment: false,
    }),
    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
      buttons: buildButtons(),
      messageParamsJson: '{}',
      messageVersion: 1,
    }),
    contextInfo,
  });

  const ownerQuote = buildOwnerQuotedMessage(jid);
  const generated = generateWAMessageFromContent(
    jid,
    { interactiveMessage },
    { quoted: ownerQuote, userJid: sock.user?.id }
  );

  await sock.relayMessage(jid, generated.message, {
    messageId: generated.key.id,
    additionalNodes: buildBizNodes(jid),
  });

  console.log(`[special-presentation] ✅ ${normalizeCommandName(commandName) || 'special'} | style=${style} | jid=${jid}`);
  return generated;
}

module.exports = {
  OWNER_PHONE,
  OWNER_NAME,
  BOT_TITLE,
  BOT_URL,
  SPECIAL_COMMANDS,
  isSpecialCommand,
  sendSpecialPresentation,
};
