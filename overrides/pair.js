'use strict';

/**
 * .pair — self-service pairing with native copy-code + website button.
 * Pairing/session creation remains delegated to utils/pairingService.js.
 */

const config = require('../../config');
const {
  proto,
  generateWAMessageFromContent,
} = require('@whiskeysockets/baileys');

const prefix = config.prefix || '.';
const BOT_URL = 'https://the-big-dipper.onrender.com';

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout (${ms / 1000}s) — ${label}`)), ms)),
  ]);
}

function safeErrMsg(err) {
  if (!err) return 'ᴇʀʀᴇᴜʀ ɪɴᴄᴏɴɴᴜᴇ';
  if (typeof err === 'string') return err;
  if (err.message) return err.message;
  try { return JSON.stringify(err); } catch { return String(err); }
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

function pairNewsletterContext() {
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
      title: 'THE BIG DIPPER • CONNEXION',
      body: 'Code de connexion WhatsApp',
      mediaType: 1,
      sourceUrl: BOT_URL,
      mediaUrl: BOT_URL,
      renderLargerThumbnail: false,
    },
  };
}

async function sendPairCodeCard(sock, jid, msg, code, cleanNumber, footer) {
  const displayCode = String(code || '').trim();
  const copyCode = displayCode.replace(/[^0-9A-Za-z]/g, '') || displayCode;
  const body =
    `╭━≪• *🔑 ᴄᴏᴅᴇ ᴅᴇ ᴄᴏɴɴᴇxɪᴏɴ* •≫━╾╮\n` +
    `┃\n┃  *${displayCode}*\n┃\n` +
    `╰━━━━━━━━━━━━━━━━━━╯\n\n` +
    `📱 *ɴᴜᴍᴇ́ʀᴏ :* +${cleanNumber}\n\n` +
    `📱 *ᴇ́ᴛᴀᴘᴇs :*\n` +
    `*1.* Ouvre WhatsApp\n` +
    `*2.* ⚙️ Paramètres → Appareils connectés\n` +
    `*3.* Connecter avec un numéro\n` +
    `*4.* Entre le code ci-dessus\n\n` +
    `⚠️ *Ce code expire en quelques minutes.*\n\n${footer}`;

  const interactiveMessage = proto.Message.InteractiveMessage.create({
    body: proto.Message.InteractiveMessage.Body.create({ text: body }),
    footer: proto.Message.InteractiveMessage.Footer.create({ text: '' }),
    header: proto.Message.InteractiveMessage.Header.create({ title: '', subtitle: '', hasMediaAttachment: false }),
    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
      buttons: [
        {
          name: 'cta_copy',
          buttonParamsJson: JSON.stringify({
            display_text: '📋 Copier le code',
            id: 'pairing_code',
            copy_code: copyCode,
          }),
        },
        {
          name: 'cta_url',
          buttonParamsJson: JSON.stringify({
            display_text: '🌐 Connecter sur le site',
            url: BOT_URL,
            merchant_url: BOT_URL,
          }),
        },
      ],
      messageParamsJson: '{}',
      messageVersion: 1,
    }),
    contextInfo: pairNewsletterContext(),
  });

  const generated = generateWAMessageFromContent(
    jid,
    { interactiveMessage },
    { quoted: msg, userJid: sock.user?.id }
  );
  try {
    await sock.relayMessage(jid, generated.message, {
      messageId: generated.key.id,
      additionalNodes: buildBizNodes(jid),
    });
    return generated;
  } catch (err) {
    console.warn('[pair] boutons interactifs indisponibles:', err.message);
    return sock.sendMessage(jid, {
      text: body,
      contextInfo: pairNewsletterContext(),
    }, { quoted: msg });
  }
}

module.exports = {
  name: 'pair',
  aliases: ['paircode', 'connexion', 'connect', 'newsession', 'addsession'],
  category: '🛠️ Outils généraux',
  description: 'Crée une nouvelle session WhatsApp (self-service).',
  usage: `${prefix}pair +22912345678`,
  groupOnly: false,
  adminOnly: false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const { reply, from } = extra;
    const rawNumber = args[0];
    if (!rawNumber) {
      return reply(
        `*〆 ɪɴᴅɪǫᴜᴇ ᴜɴ ɴᴜᴍᴇ́ʀᴏ !*\n\n` +
        `*📌 ᴜsᴀɢᴇ :* \`${prefix}pair +22912345678\`\n\n` +
        extra.phrases.footer()
      );
    }

    const cleanNumber = String(rawNumber).replace(/\D/g, '');
    if (cleanNumber.length < 7 || cleanNumber.length > 15) {
      return reply(
        `*〆 ɴᴜᴍᴇ́ʀᴏ ɪɴᴠᴀʟɪᴅᴇ !*\n` +
        `*ᴇxᴇᴍᴘʟᴇ :* \`${prefix}pair +22912345678\`\n\n` +
        extra.phrases.footer()
      );
    }

    if (!process.env.MONGODB_URI) return _pairLegacy(sock, msg, extra, cleanNumber);
    return _pairViaService(sock, msg, extra, cleanNumber, from);
  },
};

async function _pairLegacy(sock, msg, extra, cleanNumber) {
  const { reply, from } = extra;
  if (typeof sock?.requestPairingCode !== 'function') {
    return reply(`*❌ ᴍᴇ́ᴛʜᴏᴅᴇ ɴᴏɴ ᴅɪsᴘᴏɴɪʙʟᴇ — ʙᴏᴛ ᴘᴀs ᴘʀᴇ̂ᴛ.*\n\n${extra.phrases.footer()}`);
  }

  await reply(`*⏳ ɢᴇ́ɴᴇ́ʀᴀᴛɪᴏɴ ᴇɴ ᴄᴏᴜʀs...*\n*📱 +${cleanNumber}*\n\n${extra.phrases.footer()}`);
  try {
    const raw = await withTimeout(sock.requestPairingCode(cleanNumber), 20000, 'requestPairingCode');
    const code = String(raw || '').match(/.{1,4}/g)?.join('-') || String(raw || '????-????');
    return await sendPairCodeCard(sock, from, msg, code, cleanNumber, extra.phrases.footer());
  } catch (err) {
    console.error('[pair legacy]', safeErrMsg(err));
    return reply(`*❌ ᴇ́ᴄʜᴇᴄ :* ${safeErrMsg(err)}\n\n${extra.phrases.footer()}`);
  }
}

async function _pairViaService(sock, msg, extra, cleanNumber, from) {
  const { reply, sender } = extra;
  const { createPairingSession, PairingError } = require('../../utils/pairingService');

  await reply(
    `*⏳ ᴄʀᴇ́ᴀᴛɪᴏɴ ᴅᴇ ʟᴀ sᴇssɪᴏɴ ᴇɴ ᴄᴏᴜʀs...*\n` +
    `*📱 ɴᴜᴍᴇ́ʀᴏ :* +${cleanNumber}\n\n${extra.phrases.footer()}`
  );

  try {
    const { pairingCode, reconnected } = await createPairingSession(cleanNumber, {
      requesterKey: sender || from,
    });

    if (reconnected) {
      return reply(
        `╭━≪• *🔄 sᴇssɪᴏɴ ʀᴇᴄᴏɴɴᴇᴄᴛᴇ́ᴇ* •≫━╾╮\n` +
        `┃\n┃ 📱 +${cleanNumber}\n` +
        `┃ ✅ Ce numéro était déjà appairé : reconnexion avec les identifiants existants.\n` +
        `┃\n╰━━━━━━━━━━━━━━━━━╯\n\n${extra.phrases.footer()}`
      );
    }

    return await sendPairCodeCard(sock, from, msg, pairingCode, cleanNumber, extra.phrases.footer());
  } catch (err) {
    console.error('[pair multi] error:', err.message);
    if (err instanceof PairingError) {
      const messages = {
        NO_MONGODB: '*❌ MongoDB non configuré.*',
        DB_UNAVAILABLE: '*❌ Connexion à la base de données impossible. Réessaie dans un instant.*',
        INVALID_NUMBER: '*❌ Numéro invalide.*',
        COOLDOWN: `*⏳ ${err.message}*`,
        ALREADY_ACTIVE: `*⚠️ ${err.message}*`,
        CODE_FAILED: `*❌ Échec de génération du code :* ${err.message}`,
      };
      return reply(`${messages[err.code] || `*❌ ${err.message}*`}\n\n${extra.phrases.footer()}`);
    }
    return reply(`*❌ ᴇ́ᴄʜᴇᴄ ᴄʀᴇ́ᴀᴛɪᴏɴ sᴇssɪᴏɴ :*\n${safeErrMsg(err)}\n\n${extra.phrases.footer()}`);
  }
}
