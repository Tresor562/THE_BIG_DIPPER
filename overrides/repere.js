'use strict';

/**
 * Repere Command — NEXUS TECH
 * Partage de la chaîne Nexus Tech avec image + newsletter + vrai bouton CTA.
 */

const axios = require('axios');
const config = require('../../config');
const {
  proto,
  prepareWAMessageMedia,
  generateWAMessageFromContent,
} = require('@whiskeysockets/baileys');

const IMAGE_URL = 'https://files.catbox.moe/awh9z3.png';
const NEXUS_TECH_NAME = '⏤͟͟͞͞𝄞 ᬼ⃟𝙉̲𝙀̲𝙓̲𝙐̲𝙎̲ 𝙏̲𝙀̲𝘾̲𝙃̲ ✧ 👨‍💻';

function getChannelConfig() {
  return {
    newsletterJid: config.newsletterJid || '120363411005383995@newsletter',
    channelUrl: config.social?.whatsappChannel || 'https://whatsapp.com/channel/0029VbCKhnq7j6gEhuUKMP1V',
  };
}

function getContextInfo() {
  const { newsletterJid } = getChannelConfig();
  return {
    isForwarded: true,
    forwardingScore: 1,
    forwardedNewsletterMessageInfo: {
      newsletterJid,
      newsletterName: NEXUS_TECH_NAME,
      serverMessageId: -1,
    },
  };
}

async function fetchImage() {
  try {
    const res = await axios.get(IMAGE_URL, {
      responseType: 'arraybuffer',
      timeout: 8000,
      maxRedirects: 5,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.data || res.data.byteLength < 256) return null;
    return Buffer.from(res.data);
  } catch (err) {
    console.warn('[repere] ⚠️ Image indisponible:', err.message);
    return null;
  }
}

async function sendInteractiveRepere(sock, jid, caption, imageBuffer, quoted) {
  const { channelUrl } = getChannelConfig();
  let header = proto.Message.InteractiveMessage.Header.create({
    title: '',
    subtitle: '',
    hasMediaAttachment: false,
  });

  if (imageBuffer) {
    const prepared = await prepareWAMessageMedia(
      { image: imageBuffer },
      { upload: sock.waUploadToServer }
    );
    header = proto.Message.InteractiveMessage.Header.create({
      ...prepared,
      title: '',
      subtitle: '',
      hasMediaAttachment: true,
    });
  }

  const interactiveMessage = proto.Message.InteractiveMessage.create({
    body: proto.Message.InteractiveMessage.Body.create({ text: caption }),
    footer: proto.Message.InteractiveMessage.Footer.create({ text: '' }),
    header,
    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
      buttons: [
        {
          name: 'cta_url',
          buttonParamsJson: JSON.stringify({
            display_text: '📢 Rejoindre la chaîne',
            url: channelUrl,
            merchant_url: channelUrl,
          }),
        },
      ],
    }),
    contextInfo: getContextInfo(),
  });

  const generated = generateWAMessageFromContent(
    jid,
    {
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2,
          },
          interactiveMessage,
        },
      },
    },
    { quoted: quoted || undefined, userJid: sock.user?.id }
  );

  await sock.relayMessage(jid, generated.message, { messageId: generated.key.id });
  return generated;
}

async function sendStandardNewsletterFallback(sock, jid, text, imageBuffer, quoted) {
  const opts = quoted && jid.endsWith('@g.us') ? { quoted } : undefined;
  const contextInfo = getContextInfo();
  if (imageBuffer && text.length <= 1000) {
    return sock.sendMessage(jid, { image: imageBuffer, caption: text, contextInfo }, opts);
  }
  if (imageBuffer) {
    await sock.sendMessage(jid, { image: imageBuffer, caption: '📢 NEXUS TECH', contextInfo }, opts);
  }
  return sock.sendMessage(jid, { text, contextInfo }, opts);
}

async function sendHardFallback(sock, jid, text, imageBuffer, quoted) {
  const opts = quoted && jid.endsWith('@g.us') ? { quoted } : undefined;
  if (imageBuffer && text.length <= 1000) {
    return sock.sendMessage(jid, { image: imageBuffer, caption: text }, opts);
  }
  return sock.sendMessage(jid, { text }, opts);
}

module.exports = {
  name: 'repere',
  aliases: ['Repere', 'REPERE', 'rep', 'repère'],
  category: '👑 Owner',
  ownerOnly: true,
  description: '『 NEXUS TECH 』➪ partage la chaîne officielle avec bouton direct',
  usage: `${config.prefix || '.'}repere | ${config.prefix || '.'}repère | ${config.prefix || '.'}rep`,

  async execute(sock, msg, args, extra) {
    const { reply, isOwner, from } = extra;

    if (!isOwner && !extra.isSupremeOwner) {
      return reply(`*⛔ ᴀᴄᴄᴇs ʀᴇꜰᴜsᴇ́*\n> *𝐃𝐈𝐏𝐏𝐄𝐑 — ʟ'ᴏᴍʙʀᴇ ɪɴᴄᴀʀɴᴇ́*`);
    }

    const caption =
      `${NEXUS_TECH_NAME}\n\n` +
      `☁️ׄ ︵ ׅ 🚀 𝗟𝗮 𝘁𝗲𝗰𝗵 𝗯𝗼𝘂𝗴𝗲 𝘃𝗶𝘁𝗲… 𝗻𝗲 𝗿𝗲𝘀𝘁𝗲 𝗽𝗮𝘀 𝗱𝗲𝗿𝗿𝗶𝗲̀𝗿𝗲.\n\n` +
      `⚡ 𝗗𝗲́𝘃𝗲𝗹𝗼𝗽𝗽𝗲𝗺𝗲𝗻𝘁 & 𝗽𝗿𝗼𝗴𝗿𝗮𝗺𝗺𝗮𝘁𝗶𝗼𝗻\n` +
      `🤖 𝗜𝗔 & 𝗮𝘂𝘁𝗼𝗺𝗮𝘁𝗶𝘀𝗮𝘁𝗶𝗼𝗻\n` +
      `🛡️ 𝗖𝘆𝗯𝗲𝗿𝘀𝗲́𝗰𝘂𝗿𝗶𝘁𝗲́\n` +
      `🧰 𝗢𝘂𝘁𝗶𝗹𝘀, 𝗮𝗽𝗽𝘀 & 𝗿𝗲𝘀𝘀𝗼𝘂𝗿𝗰𝗲𝘀\n` +
      `💡 𝗣𝗿𝗼𝗷𝗲𝘁𝘀, 𝗮𝘀𝘁𝘂𝗰𝗲𝘀 & 𝗱𝗲́𝗰𝗼𝘂𝘃𝗲𝗿𝘁𝗲𝘀\n\n` +
      `Des contenus utiles. Des nouveautés. Des projets concrets.\n\n` +
      `📢 𝗥𝗲𝗷𝗼𝗶𝗻𝘀 𝗡𝗲𝘅𝘂𝘀 𝗧𝗲𝗰𝗵 𝗲𝘁 𝗿𝗲𝘀𝘁𝗲 𝗰𝗼𝗻𝗻𝗲𝗰𝘁𝗲́ 𝗮̀ 𝗰𝗲 𝗾𝘂𝗶 𝗰𝗼𝗻𝘀𝘁𝗿𝘂𝗶𝘁 𝗱𝗲𝗺𝗮𝗶𝗻.\n\n` +
      `𓆩⚡𓆪 𝙉𝙀𝙓𝙐𝙎 𝙏𝙀𝘾𝙃\n` +
      `𝑻𝒆𝒄𝒉 • 𝑪𝒐𝒅𝒆 • 𝑨𝑰 • 𝑪𝒚𝒃𝒆𝒓`;

    const imageBuffer = await fetchImage();
    const quoted = from?.endsWith('@g.us') ? msg : null;

    // Niveau 1 : rendu complet demandé (image + effet newsletter + CTA).
    try {
      await sendInteractiveRepere(sock, from, caption, imageBuffer, quoted);
      console.log('[repere] ✅ Nexus Tech + newsletter + CTA envoyés dans:', from);
      return;
    } catch (interactiveErr) {
      console.warn('[repere] ⚠️ Interactif indisponible → fallback newsletter:', interactiveErr.message);
    }

    const { channelUrl } = getChannelConfig();
    const fallbackText = `${caption}\n\n📢 *Rejoindre la chaîne :* ${channelUrl}`;

    // Niveau 2 : image + newsletter sans nativeFlow.
    try {
      await sendStandardNewsletterFallback(sock, from, fallbackText, imageBuffer, quoted);
      console.log('[repere] ✅ fallback newsletter envoyé dans:', from);
      return;
    } catch (newsletterErr) {
      console.warn('[repere] ⚠️ Newsletter standard indisponible → fallback brut:', newsletterErr.message);
    }

    // Niveau 3 : aucune metadata avancée. Cette voie doit rester indépendante.
    try {
      await sendHardFallback(sock, from, fallbackText, imageBuffer, quoted);
      console.log('[repere] ✅ fallback brut envoyé dans:', from);
    } catch (hardErr) {
      console.error('[repere] ❌ Tous les chemins ont échoué:', hardErr.message);
      await reply(`*❌ Erreur repere :* ${hardErr.message.slice(0, 80)}`);
    }
  },
};
