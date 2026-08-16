'use strict';

/**
 * .pair — self-service pairing with native copy-code + website button.
 * Pairing/session creation remains delegated to utils/pairingService.js.
 * Presentation follows the active response style (0..20).
 */

const config = require('../../config');
const styleManager = require('../../utils/styleManager');
const { renderResponse, getProfile, separatorFor } = require('../../utils/responseStyle');
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
  if (!err) return 'Erreur inconnue';
  if (typeof err === 'string') return err;
  if (err.message) return err.message;
  try { return JSON.stringify(err); } catch { return String(err); }
}

function activeStyle() {
  return Number(styleManager.getStyle()) || 0;
}

function styled(type, title, body, details = '') {
  return renderResponse({
    type,
    title,
    body,
    details,
    footer: false,
    style: activeStyle(),
  });
}

function codeBody(code, cleanNumber) {
  const style = activeStyle();
  const profile = getProfile(style);
  return [
    `${profile.accent} *${code}*`,
    separatorFor(style),
    `📱 Numéro : +${cleanNumber}`,
    '',
    '1. Ouvre WhatsApp',
    '2. Paramètres → Appareils connectés',
    '3. Connecter avec un numéro',
    '4. Entre le code affiché ci-dessus',
    '',
    '⚠️ Le code expire après quelques minutes.',
  ].join('\n');
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
      body: `Code de connexion • style ${activeStyle()}`,
      mediaType: 1,
      sourceUrl: BOT_URL,
      mediaUrl: BOT_URL,
      renderLargerThumbnail: false,
    },
  };
}

async function sendPairCodeCard(sock, jid, msg, code, cleanNumber) {
  const displayCode = String(code || '').trim();
  const copyCode = displayCode.replace(/[^0-9A-Za-z]/g, '') || displayCode;
  const body = styled('success', 'CODE DE CONNEXION', codeBody(displayCode, cleanNumber));

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
  description: 'Crée une nouvelle session WhatsApp en self-service, avec présentation adaptée au style actif.',
  usage: `${prefix}pair +22912345678`,
  groupOnly: false,
  adminOnly: false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const rawNumber = args[0];
    if (!rawNumber) {
      return extra.reply(styled('usage', 'PAIR', `Usage : ${prefix}pair +22912345678`));
    }

    const cleanNumber = String(rawNumber).replace(/\D/g, '');
    if (cleanNumber.length < 7 || cleanNumber.length > 15) {
      return extra.reply(styled('error', 'PAIR', 'Numéro invalide.', `Exemple : ${prefix}pair +22912345678`));
    }

    if (!process.env.MONGODB_URI) return _pairLegacy(sock, msg, extra, cleanNumber);
    return _pairViaService(sock, msg, extra, cleanNumber);
  },
};

async function _pairLegacy(sock, msg, extra, cleanNumber) {
  if (typeof sock?.requestPairingCode !== 'function') {
    return extra.reply(styled('error', 'PAIR', 'Méthode de pairing indisponible : le socket n’est pas prêt.'));
  }

  await extra.reply(styled('wait', 'PAIR', `Génération du code pour +${cleanNumber}…`));
  try {
    const raw = await withTimeout(sock.requestPairingCode(cleanNumber), 20000, 'requestPairingCode');
    const code = String(raw || '').match(/.{1,4}/g)?.join('-') || String(raw || '????-????');
    return sendPairCodeCard(sock, extra.from, msg, code, cleanNumber);
  } catch (err) {
    console.error('[pair legacy]', safeErrMsg(err));
    return extra.reply(styled('error', 'PAIR', safeErrMsg(err)));
  }
}

async function _pairViaService(sock, msg, extra, cleanNumber) {
  const { createPairingSession, PairingError } = require('../../utils/pairingService');
  const { sender, from } = extra;

  await extra.reply(styled('wait', 'PAIR', `Création de la session pour +${cleanNumber}…`));

  try {
    const { pairingCode, reconnected } = await createPairingSession(cleanNumber, {
      requesterKey: sender || from,
    });

    if (reconnected) {
      return extra.reply(styled(
        'success',
        'SESSION RECONNECTÉE',
        `📱 +${cleanNumber}\n\nCette session existait déjà. Les identifiants sauvegardés ont été réutilisés.`
      ));
    }

    return sendPairCodeCard(sock, extra.from, msg, pairingCode, cleanNumber);
  } catch (err) {
    console.error('[pair multi] error:', err.message);
    if (err instanceof PairingError) {
      const messages = {
        NO_MONGODB: 'MongoDB non configuré.',
        DB_UNAVAILABLE: 'Connexion à la base de données impossible. Réessaie dans un instant.',
        INVALID_NUMBER: 'Numéro invalide.',
        COOLDOWN: err.message,
        ALREADY_ACTIVE: err.message,
        CODE_FAILED: `Échec de génération du code : ${err.message}`,
      };
      return extra.reply(styled(err.code === 'COOLDOWN' ? 'warning' : 'error', 'PAIR', messages[err.code] || err.message));
    }
    return extra.reply(styled('error', 'PAIR', safeErrMsg(err)));
  }
}
