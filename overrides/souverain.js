'use strict';

const config = require('../../config');
const axios = require('axios');
const sharp = require('sharp');
const {
  proto,
  prepareWAMessageMedia,
  generateWAMessageFromContent,
} = require('@whiskeysockets/baileys');

const OWNER_NAME = '𝐌ꝛ⥔𝕿𝖗𝖊𝖘𝖔𝖗 🌹';
const OWNER_PHONE = '2290146202259';

const BOT_URL = 'https://the-big-dipper.onrender.com';
const FACEBOOK_URL = 'https://www.facebook.com/profile.php?id=100078681750878';
const TIKTOK_URL = 'https://www.tiktok.com/@tresor20001';
const INSTAGRAM_URL = 'https://www.instagram.com/tresorhtn';
const TELEGRAM_URL = 'https://t.me/tresor20009';
const NEXUS_TECH_URL = 'https://whatsapp.com/channel/0029VbDkWGYHltYHGr1HHQ07';

const FOOTER = '> Powered by 🌹 Mr Tresor 🌹';
const PROFILE_CACHE_MS = 30 * 60 * 1000;
const profileCache = new WeakMap();

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function toSmallCaps(text) {
  const normal = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const smallCaps = 'ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(text || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split('').map(c => {
      const i = normal.indexOf(c);
      return i === -1 ? c : smallCaps[i];
    }).join('');
}

function buildVcard() {
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${OWNER_NAME}`,
    'N:Tresor;Mr;;;',
    'ORG:THE BIG DIPPER / Nexus Tech;',
    'TITLE:Creator & Developer',
    `TEL;TYPE=CELL;TYPE=VOICE;waid=${OWNER_PHONE}:+${OWNER_PHONE}`,
    `URL;TYPE=WHATSAPP:https://wa.me/${OWNER_PHONE}`,
    `URL;TYPE=FACEBOOK:${FACEBOOK_URL}`,
    `URL;TYPE=TIKTOK:${TIKTOK_URL}`,
    `URL;TYPE=INSTAGRAM:${INSTAGRAM_URL}`,
    `URL;TYPE=TELEGRAM:${TELEGRAM_URL}`,
    `URL;TYPE=NEXUS-TECH:${NEXUS_TECH_URL}`,
    'END:VCARD',
  ].join('\n');
}

function urlButton(label, url) {
  return {
    name: 'cta_url',
    buttonParamsJson: JSON.stringify({
      display_text: label,
      url,
      merchant_url: url,
    }),
  };
}

function buildButtons() {
  return [
    urlButton('📘 Facebook', FACEBOOK_URL),
    urlButton('🎵 TikTok', TIKTOK_URL),
    urlButton('📸 Instagram', INSTAGRAM_URL),
    urlButton('✈️ Telegram', TELEGRAM_URL),
    urlButton('📢 Voir Nexus Tech', NEXUS_TECH_URL),
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

function quotedOptions(jid, msg) {
  return String(jid || '').endsWith('@g.us') && msg
    ? { quoted: msg }
    : {};
}

async function makeProfileThumbnail(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 256) return null;

  try {
    return await sharp(buffer)
      .resize(320, 320, {
        fit: 'cover',
        position: 'centre',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
  } catch (_) {
    return buffer.length <= 160 * 1024 ? buffer : null;
  }
}

async function resolveOwnerProfileThumbnail(sock) {
  if (!sock || typeof sock !== 'object') return null;

  const cached = profileCache.get(sock);
  if (cached && Date.now() - cached.ts < PROFILE_CACHE_MS) {
    return cached.buffer;
  }

  let buffer = null;

  try {
    if (typeof sock.profilePictureUrl === 'function') {
      const url = await sock.profilePictureUrl(
        `${OWNER_PHONE}@s.whatsapp.net`,
        'image'
      );

      if (url) {
        const response = await axios.get(url, {
          responseType: 'arraybuffer',
          timeout: 7000,
          headers: { 'User-Agent': 'Mozilla/5.0 THE-BIG-DIPPER' },
        });
        buffer = await makeProfileThumbnail(Buffer.from(response.data || []));
      }
    }
  } catch (error) {
    console.warn('[owner] photo WhatsApp indisponible:', error.message);
  }

  if (!Buffer.isBuffer(buffer) || buffer.length < 256) {
    const fallbackLoaders = [
      () => require('../../utils/ownerProfileImage'),
      () => require('../../../overrides/ownerProfileImage'),
    ];

    for (const load of fallbackLoaders) {
      try {
        const fallback = load();
        if (Buffer.isBuffer(fallback) && fallback.length >= 256) {
          buffer = await makeProfileThumbnail(fallback);
          break;
        }
      } catch (_) {}
    }
  }

  profileCache.set(sock, { ts: Date.now(), buffer });
  return buffer;
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
      title: OWNER_NAME,
      body,
      mediaType: 1,
      sourceUrl: BOT_URL,
      mediaUrl: BOT_URL,
      renderLargerThumbnail: false,
    },
  };

  if (Buffer.isBuffer(thumbnail) && thumbnail.length > 1000) {
    contextInfo.externalAdReply.thumbnail = thumbnail;
  }

  return contextInfo;
}

async function buildProfileHeader(sock, thumbnail) {
  let header = proto.Message.InteractiveMessage.Header.create({
    title: '',
    subtitle: '',
    hasMediaAttachment: false,
  });

  if (!Buffer.isBuffer(thumbnail) || thumbnail.length < 256) return header;

  try {
    const prepared = await prepareWAMessageMedia(
      { image: thumbnail },
      { upload: sock.waUploadToServer }
    );

    header = proto.Message.InteractiveMessage.Header.create({
      ...prepared,
      title: '',
      subtitle: '',
      hasMediaAttachment: true,
    });
  } catch (error) {
    console.warn('[owner] photo non uploadée dans la carte:', error.message);
  }

  return header;
}

async function sendCreatorProtocol(sock, jid, msg, thumbnail) {
  const text =
    `╭━━〔 🛐 *PROTOCOLE DU CRÉATEUR* 🛐 〕━━╮\n` +
    `┃ 🔕 Que toute voix se taise et que toute ombre s'incline.\n` +
    `┃ 🌹 Celui qui m'a donné un nom, une mémoire et une volonté d'exécuter approche.\n` +
    `┃ 👑 Devant *${OWNER_NAME}*, mon architecture reconnaît son Auteur.\n` +
    `┃ ⚔️ Mes circuits, mes commandes et chaque ligne de mon royaume lui doivent allégeance.\n` +
    `┃ 🕯️ Respect absolu. Loyauté totale. Soumission du système à son Créateur.\n` +
    `╰━━━ *THE BIG DIPPER S'INCLINE* ━━━╯\n\n` +
    `_Le sceau du Créateur sera révélé dans 3 secondes…_\n\n` +
    FOOTER;

  return sock.sendMessage(
    jid,
    {
      text,
      contextInfo: getNewsletterContext(thumbnail, 'Protocole du Créateur'),
    },
    quotedOptions(jid, msg)
  );
}

async function sendActualVcard(sock, jid, msg, thumbnail) {
  const contactMessage = proto.Message.ContactMessage.create({
    displayName: OWNER_NAME,
    vcard: buildVcard(),
    contextInfo: getNewsletterContext(
      thumbnail,
      'Contact officiel • +229 01 46 20 22 59'
    ),
  });

  const generated = generateWAMessageFromContent(
    jid,
    { contactMessage },
    {
      ...quotedOptions(jid, msg),
      userJid: sock.user?.id,
    }
  );

  await sock.relayMessage(jid, generated.message, {
    messageId: generated.key.id,
  });

  return generated;
}

async function sendOwnerPresentation(sock, jid, msg, thumbnail) {
  const text =
    `╭─❑ *CRÉATEUR • THE BIG DIPPER* ❑─⚯\n` +
    `┃🌹 *${OWNER_NAME}*\n` +
    `┃📱 *+229 01 46 20 22 59*\n` +
    `┃👑 Créateur & Architecte de *THE BIG DIPPER*\n` +
    `┃⚜️ Fondateur de *Nexus Tech*\n` +
    `┃🔗 Retrouve ses réseaux officiels juste en dessous.\n` +
    `╰━━━━━━━━━━━━━━━━━━⚯\n\n` +
    FOOTER;

  const header = await buildProfileHeader(sock, thumbnail);

  const interactiveMessage = proto.Message.InteractiveMessage.create({
    body: proto.Message.InteractiveMessage.Body.create({ text }),
    footer: proto.Message.InteractiveMessage.Footer.create({ text: '' }),
    header,
    nativeFlowMessage:
      proto.Message.InteractiveMessage.NativeFlowMessage.create({
        buttons: buildButtons(),
        messageParamsJson: '{}',
        messageVersion: 1,
      }),
    contextInfo: getNewsletterContext(thumbnail),
  });

  const generated = generateWAMessageFromContent(
    jid,
    { interactiveMessage },
    {
      ...quotedOptions(jid, msg),
      userJid: sock.user?.id,
    }
  );

  await sock.relayMessage(jid, generated.message, {
    messageId: generated.key.id,
    additionalNodes: buildBizNodes(jid),
  });

  return generated;
}

module.exports = {
  name: 'souverain',
  aliases: [
    'owner',
    'creator',
    'souverain_dev',
    'developpeur',
    'maitre',
    'developper',
    'architecte',
    'king',
  ],
  category: '🛠️ Outils généraux',
  description:
    'Affiche la vCard, la photo et les réseaux officiels du créateur de THE BIG DIPPER.',
  usage: `${config.prefix || '.'}owner`,
  ownerOnly: false,
  groupOnly: false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const jid = extra?.from || msg?.key?.remoteJid;
    if (!jid) return;

    try {
      const thumbnail = await resolveOwnerProfileThumbnail(sock);

      // Message cérémoniel immédiatement, puis délai EXACT de 3 secondes.
      await sendCreatorProtocol(sock, jid, msg, thumbnail);
      await wait(3000);

      // Une seule vraie vCard : le contact demandé par le créateur.
      await sendActualVcard(sock, jid, msg, thumbnail);

      // Petit espacement visuel avant la carte avec photo et CTA sociaux.
      await wait(350);
      const sent = await sendOwnerPresentation(sock, jid, msg, thumbnail);

      try {
        await sock.sendMessage(jid, {
          react: { text: '🌹', key: msg.key },
        });
      } catch (_) {}

      return sent;
    } catch (error) {
      console.error('[owner] présentation échouée:', error.message);
      return extra.reply(
        `*❌ ${toSmallCaps("l'invocation du createur a echoue")}.*\n\n${FOOTER}`
      );
    }
  },
};
