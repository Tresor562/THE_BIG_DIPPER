'use strict';

const axios = require('axios');
const config = require('../../config.js');
const {
  proto,
  generateWAMessageFromContent,
} = require('@whiskeysockets/baileys');

const NEXUS_TECH_URL = 'https://whatsapp.com/channel/0029VbDkWGYHltYHGr1HHQ07';
const OTAKU_NEXUS_URL = 'https://whatsapp.com/channel/0029VbCKhnq7j6gEhuUKMP1V';
const SUPPORT_GROUP_URL = 'https://chat.whatsapp.com/Dm7yX11U7vmCCFM240sNKq?s=cl&p=a&ilr=1';
const MAX_TEXT_LENGTH = 1800;
const MAX_TTS_CHUNK = 180;

const LANGUAGE_NAMES = {
  fr: 'Français', en: 'English', es: 'Español', pt: 'Português', de: 'Deutsch',
  it: 'Italiano', nl: 'Nederlands', tr: 'Türkçe', ar: 'العربية', ja: '日本語',
  ko: '한국어', zh: '中文', 'zh-CN': '中文', 'zh-TW': '繁體中文', ru: 'Русский',
  uk: 'Українська', hi: 'हिन्दी', id: 'Bahasa Indonesia', vi: 'Tiếng Việt', th: 'ไทย',
  pl: 'Polski', sv: 'Svenska', no: 'Norsk', da: 'Dansk', fi: 'Suomi', cs: 'Čeština',
  ro: 'Română', hu: 'Magyar', el: 'Ελληνικά', he: 'עברית', sw: 'Kiswahili',
};

const TTS_LOCALES = {
  fr: 'fr-FR', en: 'en-US', es: 'es-ES', pt: 'pt-BR', de: 'de-DE', it: 'it-IT',
  nl: 'nl-NL', tr: 'tr-TR', ar: 'ar-SA', ja: 'ja-JP', ko: 'ko-KR', zh: 'zh-CN',
  'zh-CN': 'zh-CN', 'zh-TW': 'zh-TW', ru: 'ru-RU', uk: 'uk-UA', hi: 'hi-IN',
  id: 'id-ID', vi: 'vi-VN', th: 'th-TH', pl: 'pl-PL', sv: 'sv-SE', no: 'nb-NO',
  da: 'da-DK', fi: 'fi-FI', cs: 'cs-CZ', ro: 'ro-RO', hu: 'hu-HU', el: 'el-GR',
  he: 'he-IL', sw: 'sw-KE',
};

function toSmallCaps(text) {
  const normal = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const smallCaps = 'ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split('').map(c => {
      const i = normal.indexOf(c);
      return i === -1 ? c : smallCaps[i];
    }).join('');
}

function extractQuotedText(msg) {
  const quoted = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (!quoted) return '';
  return quoted.conversation ||
    quoted.extendedTextMessage?.text ||
    quoted.imageMessage?.caption ||
    quoted.videoMessage?.caption ||
    quoted.documentMessage?.caption ||
    '';
}

function splitText(text, maxLength = MAX_TTS_CHUNK) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  const parts = [];
  let remaining = normalized;

  while (remaining.length > maxLength) {
    let cut = remaining.lastIndexOf('. ', maxLength);
    if (cut < Math.floor(maxLength * 0.55)) cut = remaining.lastIndexOf('! ', maxLength);
    if (cut < Math.floor(maxLength * 0.55)) cut = remaining.lastIndexOf('? ', maxLength);
    if (cut < Math.floor(maxLength * 0.55)) cut = remaining.lastIndexOf(', ', maxLength);
    if (cut < Math.floor(maxLength * 0.55)) cut = remaining.lastIndexOf(' ', maxLength);
    if (cut < 1) cut = maxLength;
    else cut += 1;

    parts.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }

  if (remaining) parts.push(remaining);
  return parts;
}

function normalizeLanguage(code) {
  const raw = String(code || '').trim();
  if (!raw) return 'fr';
  const lowered = raw.toLowerCase();
  if (lowered === 'iw') return 'he';
  if (lowered === 'zh-cn' || lowered === 'zh-hans') return 'zh-CN';
  if (lowered === 'zh-tw' || lowered === 'zh-hant') return 'zh-TW';
  const base = lowered.split('-')[0];
  return Object.prototype.hasOwnProperty.call(TTS_LOCALES, base) ? base : 'fr';
}

function detectLanguageLocally(text) {
  const value = String(text || '').trim();
  if (!value) return 'fr';

  if (/[\u3040-\u30ff]/u.test(value)) return 'ja';
  if (/[\uac00-\ud7af]/u.test(value)) return 'ko';
  if (/[\u4e00-\u9fff]/u.test(value)) return 'zh-CN';
  if (/[\u0600-\u06ff]/u.test(value)) return 'ar';
  if (/[\u0900-\u097f]/u.test(value)) return 'hi';
  if (/[\u0e00-\u0e7f]/u.test(value)) return 'th';
  if (/[\u0590-\u05ff]/u.test(value)) return 'he';
  if (/[\u0370-\u03ff]/u.test(value)) return 'el';
  if (/[іїєґІЇЄҐ]/u.test(value)) return 'uk';
  if (/[\u0400-\u04ff]/u.test(value)) return 'ru';

  const words = value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z' ]/g, ' ').split(/\s+/).filter(Boolean);
  const sets = {
    fr: new Set(['le','la','les','un','une','des','de','du','et','est','je','tu','il','elle','nous','vous','bonjour','avec','pour','pas','que','qui','dans','sur']),
    en: new Set(['the','a','an','and','is','i','you','he','she','we','they','hello','with','for','not','that','this','in','on','of','to']),
    es: new Set(['el','la','los','las','un','una','y','es','yo','tu','hola','con','para','que','no','en','de','por','como']),
    pt: new Set(['o','a','os','as','um','uma','e','eu','voce','ola','com','para','que','nao','em','de','por','como']),
    de: new Set(['der','die','das','ein','eine','und','ist','ich','du','hallo','mit','fur','nicht','dass','in','von','zu']),
    it: new Set(['il','lo','la','gli','le','un','una','e','io','tu','ciao','con','per','che','non','in','di']),
    nl: new Set(['de','het','een','en','is','ik','jij','hallo','met','voor','niet','dat','in','van']),
    tr: new Set(['bir','ve','bu','ben','sen','merhaba','ile','icin','degil','ne','var','yok']),
    id: new Set(['yang','dan','ini','itu','saya','kamu','halo','dengan','untuk','tidak','di','dari']),
    sw: new Set(['na','ya','wa','ni','mimi','wewe','habari','kwa','sio','katika','hii']),
  };

  let best = 'fr';
  let bestScore = -1;
  for (const [lang, set] of Object.entries(sets)) {
    let score = 0;
    for (const word of words) if (set.has(word)) score += 1;
    if (score > bestScore) {
      best = lang;
      bestScore = score;
    }
  }
  return best;
}

async function detectLanguage(text) {
  const sample = String(text || '').slice(0, 600);
  try {
    const response = await axios.get('https://translate.googleapis.com/translate_a/single', {
      params: { client: 'gtx', sl: 'auto', tl: 'en', dt: 't', q: sample },
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0 THE-BIG-DIPPER' },
    });
    const detected = normalizeLanguage(response?.data?.[2]);
    if (detected) return detected;
  } catch (error) {
    console.warn('[tts] détection distante indisponible:', error.message);
  }
  return detectLanguageLocally(sample);
}

function looksLikeMp3(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 64) return false;
  if (buffer.slice(0, 3).toString('ascii') === 'ID3') return true;
  return buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
}

async function fetchTtsChunk(text, language, index, total) {
  const base = String(language || 'fr').split('-')[0];
  const preferred = TTS_LOCALES[language] || TTS_LOCALES[base] || base;
  const candidates = [...new Set([preferred, base])];
  let lastError;

  for (const tl of candidates) {
    try {
      const response = await axios.get('https://translate.google.com/translate_tts', {
        params: {
          ie: 'UTF-8',
          q: text,
          tl,
          client: 'tw-ob',
          idx: index,
          total,
          textlen: text.length,
        },
        responseType: 'arraybuffer',
        timeout: 20000,
        headers: {
          'User-Agent': 'Mozilla/5.0 THE-BIG-DIPPER',
          'Accept': 'audio/mpeg,audio/*;q=0.9,*/*;q=0.8',
          'Referer': 'https://translate.google.com/',
        },
      });
      const buffer = Buffer.from(response.data || []);
      if (!looksLikeMp3(buffer)) throw new Error('réponse TTS non audio');
      return buffer;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('service TTS indisponible');
}

async function synthesizeSpeech(text, language) {
  const chunks = splitText(text);
  if (!chunks.length) throw new Error('texte vide');
  const audioParts = [];
  for (let i = 0; i < chunks.length; i += 1) {
    audioParts.push(await fetchTtsChunk(chunks[i], language, i, chunks.length));
  }
  return Buffer.concat(audioParts);
}

function getNewsletterContext(language) {
  const label = LANGUAGE_NAMES[language] || LANGUAGE_NAMES[String(language || '').split('-')[0]] || language;
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
      title: 'THE BIG DIPPER • TTS',
      body: `Voix automatique • ${label}`,
      mediaType: 1,
      sourceUrl: 'https://the-big-dipper.onrender.com',
      mediaUrl: 'https://the-big-dipper.onrender.com',
      renderLargerThumbnail: false,
    },
  };
}

function urlButton(label, url) {
  return {
    name: 'cta_url',
    buttonParamsJson: JSON.stringify({ display_text: label, url, merchant_url: url }),
  };
}

function buildButtons() {
  return [
    urlButton('📢 Voir Nexus Tech', NEXUS_TECH_URL),
    urlButton('🖤 Voir Otaku Nexus', OTAKU_NEXUS_URL),
    urlButton('🛠️ Groupe Support', SUPPORT_GROUP_URL),
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

async function sendButtonPanel(sock, jid, audioMessage, language) {
  const label = LANGUAGE_NAMES[language] || LANGUAGE_NAMES[String(language || '').split('-')[0]] || language;
  const text = `🎙️ *THE BIG DIPPER • TTS*\n🌐 Langue détectée : *${label}*\n🔊 Audio généré avec la voix adaptée à cette langue.`;

  const interactiveMessage = proto.Message.InteractiveMessage.create({
    body: proto.Message.InteractiveMessage.Body.create({ text }),
    footer: proto.Message.InteractiveMessage.Footer.create({ text: '' }),
    header: proto.Message.InteractiveMessage.Header.create({ title: '', subtitle: '', hasMediaAttachment: false }),
    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
      buttons: buildButtons(),
      messageParamsJson: '{}',
      messageVersion: 1,
    }),
    contextInfo: getNewsletterContext(language),
  });

  const generated = generateWAMessageFromContent(
    jid,
    { interactiveMessage },
    { quoted: audioMessage, userJid: sock.user?.id }
  );
  await sock.relayMessage(jid, generated.message, {
    messageId: generated.key.id,
    additionalNodes: buildBizNodes(jid),
  });
  return generated;
}

module.exports = {
  name: 'tts',
  aliases: ['speak', 'say', 'murmure'],
  category: '🛠️ Outils généraux',
  description: 'Transforme un texte en audio avec détection automatique de la langue et voix adaptée.',
  usage: `${config.prefix || '.'}tts [texte ou en réponse]`,
  groupOnly: false,
  adminOnly: false,
  botAdminNeeded: false,

  async execute(sock, msg, args, extra) {
    const chatId = extra?.from || msg?.key?.remoteJid;
    if (!chatId) return;

    try {
      let text = args.join(' ').trim();
      if (!text) text = extractQuotedText(msg).trim();

      if (!text) {
        const prefix = config.prefix || '.';
        return extra.reply(
          `*⚠️ ${toSmallCaps("echec de l'invocation")}*\n\n` +
          `*┃* 🔮 *${toSmallCaps('indique un texte a prononcer')} !*\n` +
          `*┃* 💡 *${toSmallCaps('exemple')} :* \`${prefix}tts Bonjour le sanctuaire\``
        );
      }

      if (text.length > MAX_TEXT_LENGTH) {
        return extra.reply(`❌ Texte trop long : ${text.length}/${MAX_TEXT_LENGTH} caractères.`);
      }

      try { await sock.sendPresenceUpdate('recording', chatId); } catch (_) {}

      const language = await detectLanguage(text);
      const audioBuffer = await synthesizeSpeech(text, language);
      if (!looksLikeMp3(audioBuffer)) throw new Error('audio MP3 invalide après génération');

      const audioMessage = await sock.sendMessage(
        chatId,
        {
          audio: audioBuffer,
          mimetype: 'audio/mpeg',
          ptt: false,
          fileName: `THE_BIG_DIPPER_TTS_${String(language).replace(/[^a-z0-9-]/gi, '_')}.mp3`,
          contextInfo: getNewsletterContext(language),
        },
        { quoted: msg }
      );

      try { await sock.sendPresenceUpdate('paused', chatId); } catch (_) {}
      return await sendButtonPanel(sock, chatId, audioMessage, language);
    } catch (error) {
      try { await sock.sendPresenceUpdate('paused', chatId); } catch (_) {}
      console.error('[tts] erreur:', error);
      return extra.reply(
        `*❌ ${toSmallCaps("echec de l'illusion")}*\n\n` +
        `*┃* ⚠️ *${toSmallCaps('erreur')} :* ${error.message}`
      );
    }
  },
};
