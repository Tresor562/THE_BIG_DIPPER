'use strict';

/**
 * THE BIG DIPPER — OTAKU / ANIME 2026
 * Sources dynamiques : AniList GraphQL, Jikan v4, waifu.im, nekos.best.
 * Toutes les réponses de succès portent le contexte newsletter + boutons.
 */

const axios = require('axios');
const config = require('../../config');
const { isPremium } = require('../../utils/premiumDB');
const {
  proto,
  generateWAMessageFromContent,
} = require('@whiskeysockets/baileys');

const PREFIX = config.prefix || '.';
const ANILIST_API = 'https://graphql.anilist.co';
const JIKAN_API = 'https://api.jikan.moe/v4';
const WAIFU_API = 'https://api.waifu.im';
const NEKOS_API = 'https://nekos.best/api/v2';
const BOT_URL = 'https://the-big-dipper.onrender.com';
const OTAKU_NEXUS_URL = 'https://whatsapp.com/channel/0029VbCKhnq7j6gEhuUKMP1V';
const NEXUS_TECH_URL = 'https://whatsapp.com/channel/0029VbDkWGYHltYHGr1HHQ07';
const FOOTER = '> Powered by 🌹 Mr Tresor 🌹';
const USER_AGENT = 'THE-BIG-DIPPER/1.0 (https://the-big-dipper.onrender.com)';
const MEDIA_MAX_BYTES = 10 * 1024 * 1024;

const SEASON_NAMES = {
  WINTER: 'Hiver', SPRING: 'Printemps', SUMMER: 'Été', FALL: 'Automne',
};
const STATUS_NAMES = {
  FINISHED: 'Terminé', RELEASING: 'En diffusion', NOT_YET_RELEASED: 'À venir',
  CANCELLED: 'Annulé', HIATUS: 'En pause',
};
const FORMAT_NAMES = {
  TV: 'Série TV', TV_SHORT: 'Série courte', MOVIE: 'Film', SPECIAL: 'Spécial',
  OVA: 'OVA', ONA: 'ONA', MUSIC: 'Musique', MANGA: 'Manga', NOVEL: 'Novel',
  ONE_SHOT: 'One-shot',
};

function toSC(text) {
  const n = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const s = 'ᴀʙᴄᴅᴇғɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ0123456789';
  return String(text || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split('').map(c => {
      const i = n.indexOf(c);
      return i === -1 ? c : s[i];
    }).join('');
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function truncate(value, max = 650) {
  const text = stripHtml(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

function titleOf(media) {
  return media?.title?.english || media?.title?.romaji || media?.title?.native || 'Titre inconnu';
}

function fmtNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? new Intl.NumberFormat('fr-FR').format(n) : '?';
}

function fmtDateParts(date) {
  if (!date?.year) return '?';
  const y = String(date.year).padStart(4, '0');
  const m = String(date.month || 1).padStart(2, '0');
  const d = String(date.day || 1).padStart(2, '0');
  return `${d}/${m}/${y}`;
}

function fmtTimestamp(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return '?';
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Africa/Porto-Novo',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(n * 1000));
}

function fmtCountdown(seconds) {
  let total = Math.max(0, Number(seconds) || 0);
  const days = Math.floor(total / 86400); total %= 86400;
  const hours = Math.floor(total / 3600); total %= 3600;
  const minutes = Math.floor(total / 60);
  const parts = [];
  if (days) parts.push(`${days}j`);
  if (hours) parts.push(`${hours}h`);
  if (minutes || !parts.length) parts.push(`${minutes}min`);
  return parts.join(' ');
}

function currentSeason() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const season = month <= 3 ? 'WINTER' : month <= 6 ? 'SPRING' : month <= 9 ? 'SUMMER' : 'FALL';
  return { season, year: now.getFullYear() };
}

function nextSeason() {
  const { season, year } = currentSeason();
  const order = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];
  const i = order.indexOf(season);
  return i === 3 ? { season: 'WINTER', year: year + 1 } : { season: order[i + 1], year };
}

function seasonLabel(season, year) {
  return `${SEASON_NAMES[season] || season} ${year}`;
}

function premiumGuard(isOwner, sender, reply, phrases, isSupremeOwner) {
  if (!isOwner && !isSupremeOwner && !isPremium(sender)) {
    reply(
      `╭╼≪• *🚫 ʀᴇsᴇʀᴠᴇ́ ᴘʀᴇᴍɪᴜᴍ* •≫╾╮\n` +
      `┃ 👑 ${toSC('cette version est reservee aux utilisateurs premium')}\n` +
      `╰━━━━━━━━━━━━━━━━╯\n\n${phrases?.footer?.() || FOOTER}`
    );
    return true;
  }
  return false;
}

async function anilist(query, variables = {}) {
  const response = await axios.post(
    ANILIST_API,
    { query, variables },
    {
      timeout: 18000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
      },
    }
  );
  if (response.data?.errors?.length) {
    throw new Error(response.data.errors[0]?.message || 'Erreur AniList');
  }
  if (!response.data?.data) throw new Error('Réponse AniList vide');
  return response.data.data;
}

async function jikan(path, params = {}) {
  const response = await axios.get(`${JIKAN_API}${path}`, {
    params,
    timeout: 18000,
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
  });
  return response.data?.data;
}

async function downloadBuffer(url) {
  if (!url || !/^https?:\/\//i.test(String(url))) return null;
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 18000,
    maxRedirects: 5,
    maxContentLength: MEDIA_MAX_BYTES,
    maxBodyLength: MEDIA_MAX_BYTES,
    headers: { 'User-Agent': USER_AGENT },
    validateStatus: s => s >= 200 && s < 300,
  });
  const buffer = Buffer.from(response.data || []);
  if (!buffer.length || buffer.length > MEDIA_MAX_BYTES) return null;
  return buffer;
}

function getNewsletterContext(body = 'Otaku Nexus • Anime & Manga', sourceUrl = OTAKU_NEXUS_URL) {
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
      title: 'OTAKU NEXUS × THE BIG DIPPER',
      body: truncate(body, 90),
      mediaType: 1,
      sourceUrl: sourceUrl || OTAKU_NEXUS_URL,
      mediaUrl: sourceUrl || OTAKU_NEXUS_URL,
      renderLargerThumbnail: false,
    },
  };
}

function urlButton(label, url) {
  if (!url || !/^https?:\/\//i.test(String(url))) return null;
  return {
    name: 'cta_url',
    buttonParamsJson: JSON.stringify({
      display_text: label,
      url,
      merchant_url: url,
    }),
  };
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

function mergeButtons(extraButtons = []) {
  const candidates = [
    ...extraButtons,
    ['🖤 Otaku Nexus', OTAKU_NEXUS_URL],
    ['📢 Nexus Tech', NEXUS_TECH_URL],
  ];
  const seen = new Set();
  const result = [];
  for (const item of candidates) {
    const label = Array.isArray(item) ? item[0] : item?.label;
    const url = Array.isArray(item) ? item[1] : item?.url;
    if (!label || !url || seen.has(url)) continue;
    const button = urlButton(label, url);
    if (!button) continue;
    seen.add(url);
    result.push(button);
    if (result.length >= 5) break;
  }
  return result;
}

async function sendButtonPanel(sock, jid, quotedMessage, label, extraButtons = [], sourceUrl = OTAKU_NEXUS_URL) {
  const buttons = mergeButtons(extraButtons);
  if (!buttons.length) return null;

  const interactiveMessage = proto.Message.InteractiveMessage.create({
    body: proto.Message.InteractiveMessage.Body.create({
      text: `🖤 *OTAKU NEXUS × THE BIG DIPPER*\n✨ ${truncate(label, 140)}`,
    }),
    footer: proto.Message.InteractiveMessage.Footer.create({ text: 'Powered by 🌹 Mr Tresor 🌹' }),
    header: proto.Message.InteractiveMessage.Header.create({
      title: '', subtitle: '', hasMediaAttachment: false,
    }),
    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
      buttons,
      messageParamsJson: '{}',
      messageVersion: 1,
    }),
    contextInfo: getNewsletterContext(label, sourceUrl),
  });

  const generated = generateWAMessageFromContent(
    jid,
    { interactiveMessage },
    { quoted: quotedMessage, userJid: sock.user?.id }
  );
  await sock.relayMessage(jid, generated.message, {
    messageId: generated.key.id,
    additionalNodes: buildBizNodes(jid),
  });
  return generated;
}

async function sendOtakuResult(sock, msg, extra, options = {}) {
  const jid = extra?.from || msg?.key?.remoteJid;
  if (!jid) return null;

  const text = String(options.text || '').trim();
  const sourceUrl = options.sourceUrl || OTAKU_NEXUS_URL;
  const contextInfo = getNewsletterContext(options.newsletterBody || options.label || 'Otaku Nexus', sourceUrl);
  let payload;

  if (options.imageBuffer) {
    payload = { image: options.imageBuffer, caption: text, contextInfo };
  } else if (options.imageUrl) {
    const imageBuffer = await downloadBuffer(options.imageUrl).catch(() => null);
    payload = imageBuffer
      ? { image: imageBuffer, caption: text, contextInfo }
      : { text, contextInfo };
  } else {
    payload = { text, contextInfo };
  }

  const main = await sock.sendMessage(jid, payload, { quoted: msg });
  try {
    await sendButtonPanel(
      sock,
      jid,
      main,
      options.label || 'Découvre plus de contenu Otaku.',
      options.buttons || [],
      sourceUrl
    );
  } catch (error) {
    console.warn('[otaku] boutons interactifs indisponibles:', error.message);
  }
  return main;
}

const ANIME_FIELDS = `
  id idMal
  title { romaji english native }
  format status description(asHtml: false)
  startDate { year month day }
  endDate { year month day }
  season seasonYear episodes duration countryOfOrigin source
  genres synonyms averageScore meanScore popularity favourites trending
  studios(isMain: true) { nodes { name siteUrl } }
  nextAiringEpisode { episode airingAt timeUntilAiring }
  trailer { id site thumbnail }
  coverImage { extraLarge large medium color }
  bannerImage siteUrl
`;

async function searchAnime(name) {
  const data = await anilist(`
    query ($search: String) {
      Media(search: $search, type: ANIME, isAdult: false) { ${ANIME_FIELDS} }
    }
  `, { search: name });
  if (!data.Media) throw new Error(`Anime « ${name} » introuvable`);
  return data.Media;
}

async function searchManga(name) {
  const data = await anilist(`
    query ($search: String) {
      Media(search: $search, type: MANGA, isAdult: false) {
        id idMal title { romaji english native }
        format status description(asHtml: false)
        startDate { year month day } endDate { year month day }
        chapters volumes countryOfOrigin source genres synonyms
        averageScore meanScore popularity favourites
        coverImage { extraLarge large medium color }
        siteUrl
        staff(perPage: 6, sort: RELEVANCE) { edges { role node { name { full } siteUrl } } }
      }
    }
  `, { search: name });
  if (!data.Media) throw new Error(`Manga « ${name} » introuvable`);
  return data.Media;
}

async function searchCharacter(name) {
  const data = await anilist(`
    query ($search: String) {
      Character(search: $search) {
        id name { full native alternative }
        image { large medium }
        description(asHtml: false) gender age favourites siteUrl
        dateOfBirth { year month day }
        media(perPage: 5, sort: POPULARITY_DESC) {
          nodes { id type title { romaji english native } siteUrl }
        }
      }
    }
  `, { search: name });
  if (!data.Character) throw new Error(`Personnage « ${name} » introuvable`);
  return data.Character;
}

async function listSeasonAnime(season, year, sort = ['TRENDING_DESC', 'POPULARITY_DESC'], perPage = 8) {
  const data = await anilist(`
    query ($season: MediaSeason, $year: Int, $sort: [MediaSort], $perPage: Int) {
      Page(page: 1, perPage: $perPage) {
        media(type: ANIME, season: $season, seasonYear: $year, isAdult: false, sort: $sort) {
          ${ANIME_FIELDS}
        }
      }
    }
  `, { season, year, sort, perPage });
  return data.Page?.media || [];
}

async function listUpcomingAnime(perPage = 8) {
  const data = await anilist(`
    query ($perPage: Int) {
      Page(page: 1, perPage: $perPage) {
        media(type: ANIME, status: NOT_YET_RELEASED, isAdult: false, sort: [POPULARITY_DESC, TRENDING_DESC]) {
          ${ANIME_FIELDS}
        }
      }
    }
  `, { perPage });
  return data.Page?.media || [];
}

function animeButtons(media) {
  const buttons = [];
  if (media?.siteUrl) buttons.push(['🔎 Voir sur AniList', media.siteUrl]);
  if (media?.trailer?.site === 'youtube' && media.trailer.id) {
    buttons.push(['▶️ Bande-annonce', `https://www.youtube.com/watch?v=${media.trailer.id}`]);
  }
  if (media?.idMal) buttons.push(['📚 MyAnimeList', `https://myanimelist.net/anime/${media.idMal}`]);
  return buttons;
}

function animeDetailText(media) {
  const title = titleOf(media);
  const original = media?.title?.native || media?.title?.romaji || '';
  const studios = media?.studios?.nodes?.map(s => s.name).filter(Boolean).slice(0, 3).join(', ') || '?';
  const genres = media?.genres?.slice(0, 6).join(' • ') || '?';
  const airing = media?.nextAiringEpisode
    ? `\n┃ ⏭️ *Prochain épisode :* ${media.nextAiringEpisode.episode}\n┃ ⏳ *Dans :* ${fmtCountdown(media.nextAiringEpisode.timeUntilAiring)} — ${fmtTimestamp(media.nextAiringEpisode.airingAt)}`
    : '';
  const synopsis = truncate(media?.description, 720);

  return (
    `╭━━〔 🎌 *ANIME INFO* 〕━━╮\n` +
    `┃ 📺 *${title}*\n` +
    (original && original !== title ? `┃ 🇯🇵 ${original}\n` : '') +
    `┃ ⭐ *Score :* ${media?.averageScore ? `${media.averageScore}/100` : '?'}\n` +
    `┃ 🔥 *Popularité :* ${fmtNumber(media?.popularity)}\n` +
    `┃ ❤️ *Favoris :* ${fmtNumber(media?.favourites)}\n` +
    `┃ 📡 *Statut :* ${STATUS_NAMES[media?.status] || media?.status || '?'}\n` +
    `┃ 🎬 *Format :* ${FORMAT_NAMES[media?.format] || media?.format || '?'}\n` +
    `┃ 🧩 *Épisodes :* ${media?.episodes || '?'}${media?.duration ? ` × ${media.duration} min` : ''}\n` +
    `┃ 🗓️ *Saison :* ${media?.season && media?.seasonYear ? seasonLabel(media.season, media.seasonYear) : fmtDateParts(media?.startDate)}\n` +
    `┃ 🏢 *Studio :* ${studios}\n` +
    `┃ 🏷️ *Genres :* ${genres}` + airing + `\n` +
    `┃\n┃ 📝 *Synopsis*\n┃ ${synopsis || 'Synopsis indisponible.'}\n` +
    `╰━━━━━━━━━━━━━━━━━━╯\n\n${FOOTER}`
  );
}

function listText(title, items, mapper) {
  const lines = items.map((item, i) => mapper(item, i)).filter(Boolean);
  return `${title}\n\n${lines.join('\n\n')}\n\n${FOOTER}`;
}

async function getWaifuImage(tag = 'waifu', highRes = false) {
  const params = {
    IncludedTags: tag,
    IsNsfw: 'False',
    PageSize: 1,
  };
  if (highRes) {
    params.Width = '>=1200';
    params.Height = '>=1200';
  }
  try {
    const response = await axios.get(`${WAIFU_API}/images`, {
      params,
      timeout: 15000,
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    });
    const item = response.data?.items?.[0];
    if (item?.url) {
      return {
        url: item.url,
        source: item.source || '',
        artist: item.artists?.[0]?.name || '',
        width: item.width || '',
        height: item.height || '',
      };
    }
  } catch (error) {
    console.warn(`[otaku] waifu.im ${tag}:`, error.message);
  }

  const fallback = await axios.get(`https://api.waifu.pics/sfw/${tag === 'neko' ? 'neko' : 'waifu'}`, {
    timeout: 12000,
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!fallback.data?.url) throw new Error('Aucune image disponible');
  return { url: fallback.data.url, source: '', artist: '', width: '', height: '' };
}

async function getNekoImage() {
  const response = await axios.get(`${NEKOS_API}/neko`, {
    timeout: 12000,
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  const item = response.data?.results?.[0];
  if (!item?.url) throw new Error('Aucune neko disponible');
  return {
    url: item.url,
    source: item.source_url || '',
    artist: item.artist_name || '',
    artistUrl: item.artist_href || '',
    dimensions: item.dimensions || null,
  };
}

async function getAnimeQuote() {
  try {
    const response = await axios.get('https://animechan.io/api/v1/quotes/random', {
      timeout: 10000,
      headers: { 'User-Agent': USER_AGENT },
    });
    const q = response.data?.data;
    if (q) {
      return {
        quote: q.content || q.quote || '...',
        character: q.character?.name || q.character || 'Inconnu',
        anime: q.anime?.name || q.anime || 'Inconnu',
      };
    }
  } catch (_) {}
  const fallback = [
    { quote: 'Je vais devenir le Roi des Pirates !', character: 'Monkey D. Luffy', anime: 'One Piece' },
    { quote: 'Je ne reculerai jamais, c’est mon ninja way.', character: 'Naruto Uzumaki', anime: 'Naruto' },
    { quote: 'Même dans l’obscurité, il existe toujours une lumière.', character: 'Tanjiro Kamado', anime: 'Demon Slayer' },
    { quote: 'Le talent est quelque chose que l’on fait fleurir.', character: 'Tooru Oikawa', anime: 'Haikyuu!!' },
  ];
  return fallback[Math.floor(Math.random() * fallback.length)];
}

function usageError(extra, text) {
  return extra.reply(`⚠️ ${text}\n\n${FOOTER}`);
}

function errorReply(extra, label, error) {
  const msg = String(error?.message || error || 'Erreur inconnue').slice(0, 180);
  return extra.reply(`❌ *${label}*\n${msg}\n\n${FOOTER}`);
}

module.exports = [
  {
    name: 'anime',
    aliases: ['animeinfo', 'ani'],
    category: '🌸 Anime',
    description: 'Recherche une fiche anime complète et actuelle via AniList.',
    usage: `${PREFIX}anime <titre>`,
    groupOnly: false, adminOnly: false, botAdminNeeded: false,
    async execute(sock, msg, args, extra) {
      const query = args.join(' ').trim();
      try {
        let media;
        if (query) {
          media = await searchAnime(query);
        } else {
          const { season, year } = currentSeason();
          media = (await listSeasonAnime(season, year, ['TRENDING_DESC'], 1))[0];
          if (!media) throw new Error('Aucun anime tendance disponible');
        }
        await sendOtakuResult(sock, msg, extra, {
          text: animeDetailText(media),
          imageUrl: media.coverImage?.extraLarge || media.coverImage?.large,
          label: `${titleOf(media)} • fiche anime actuelle`,
          sourceUrl: media.siteUrl,
          buttons: animeButtons(media),
          newsletterBody: `${titleOf(media)} • Anime Info`,
        });
      } catch (error) { await errorReply(extra, 'Anime introuvable', error); }
    },
  },

  {
    name: 'season',
    aliases: ['animesaison', 'seasonanime', 'currentanime'],
    category: '🌸 Anime',
    description: 'Top anime de la saison actuellement diffusée.',
    usage: `${PREFIX}season`,
    groupOnly: false, adminOnly: false, botAdminNeeded: false,
    async execute(sock, msg, args, extra) {
      try {
        const { season, year } = currentSeason();
        const items = await listSeasonAnime(season, year, ['TRENDING_DESC', 'POPULARITY_DESC'], 8);
        if (!items.length) throw new Error('Saison indisponible');
        const text = listText(`╭━━〔 🌸 *SAISON • ${seasonLabel(season, year).toUpperCase()}* 〕━━╮`, items, (m, i) =>
          `${i + 1}. *${titleOf(m)}*\n   ⭐ ${m.averageScore || '?'} • 🔥 ${fmtNumber(m.popularity)} • ${m.episodes || '?'} ép.`
        );
        await sendOtakuResult(sock, msg, extra, {
          text,
          imageUrl: items[0]?.coverImage?.large,
          label: `Anime de ${seasonLabel(season, year)}`,
          sourceUrl: 'https://anilist.co/search/anime',
          buttons: [['🔎 Explorer AniList', 'https://anilist.co/search/anime']],
        });
      } catch (error) { await errorReply(extra, 'Saison anime indisponible', error); }
    },
  },

  {
    name: 'trendinganime',
    aliases: ['anitrending', 'animetrend'],
    category: '🌸 Anime',
    description: 'Anime qui font le plus parler en ce moment.',
    usage: `${PREFIX}trendinganime`,
    groupOnly: false, adminOnly: false, botAdminNeeded: false,
    async execute(sock, msg, args, extra) {
      try {
        const { season, year } = currentSeason();
        const items = await listSeasonAnime(season, year, ['TRENDING_DESC'], 10);
        const text = listText('╭━━〔 🔥 *ANIME TRENDING NOW* 〕━━╮', items, (m, i) =>
          `${i + 1}. *${titleOf(m)}*\n   📈 Trend ${fmtNumber(m.trending)} • ⭐ ${m.averageScore || '?'} • ❤️ ${fmtNumber(m.favourites)}`
        );
        await sendOtakuResult(sock, msg, extra, {
          text, imageUrl: items[0]?.coverImage?.large,
          label: 'Anime les plus tendance actuellement',
          sourceUrl: 'https://anilist.co/search/anime/trending',
          buttons: [['🔥 Voir les tendances', 'https://anilist.co/search/anime/trending']],
        });
      } catch (error) { await errorReply(extra, 'Trending anime indisponible', error); }
    },
  },

  {
    name: 'topanime',
    aliases: ['anitop', 'topani'],
    category: '🌸 Anime',
    description: 'Anime les mieux notés de la saison actuelle.',
    usage: `${PREFIX}topanime`,
    groupOnly: false, adminOnly: false, botAdminNeeded: false,
    async execute(sock, msg, args, extra) {
      try {
        const { season, year } = currentSeason();
        const items = await listSeasonAnime(season, year, ['SCORE_DESC', 'POPULARITY_DESC'], 10);
        const text = listText(`╭━━〔 🏆 *TOP ${seasonLabel(season, year).toUpperCase()}* 〕━━╮`, items, (m, i) =>
          `${i + 1}. *${titleOf(m)}* — ⭐ ${m.averageScore || '?'} / 100\n   🎬 ${FORMAT_NAMES[m.format] || m.format || '?'} • 🧩 ${m.episodes || '?'} ép.`
        );
        await sendOtakuResult(sock, msg, extra, {
          text, imageUrl: items[0]?.coverImage?.large,
          label: 'Top anime de la saison',
          sourceUrl: 'https://anilist.co/search/anime',
          buttons: [['🏆 Classement AniList', 'https://anilist.co/search/anime']],
        });
      } catch (error) { await errorReply(extra, 'Top anime indisponible', error); }
    },
  },

  {
    name: 'upcominganime',
    aliases: ['animeavenir', 'nextanime', 'aniupcoming'],
    category: '🌸 Anime',
    description: 'Anime les plus attendus qui ne sont pas encore sortis.',
    usage: `${PREFIX}upcominganime`,
    groupOnly: false, adminOnly: false, botAdminNeeded: false,
    async execute(sock, msg, args, extra) {
      try {
        const items = await listUpcomingAnime(8);
        if (!items.length) throw new Error('Aucun anime à venir trouvé');
        const text = listText('╭━━〔 🚀 *ANIME À VENIR* 〕━━╮', items, (m, i) =>
          `${i + 1}. *${titleOf(m)}*\n   📅 ${fmtDateParts(m.startDate)} • 🔥 ${fmtNumber(m.popularity)} fans`
        );
        await sendOtakuResult(sock, msg, extra, {
          text, imageUrl: items[0]?.coverImage?.large,
          label: 'Anime les plus attendus',
          sourceUrl: 'https://anilist.co/search/anime?airing%20status=NOT_YET_RELEASED',
          buttons: [['🚀 Voir les sorties', 'https://anilist.co/search/anime']],
        });
      } catch (error) { await errorReply(extra, 'Anime à venir indisponibles', error); }
    },
  },

  {
    name: 'airing',
    aliases: ['nextepisode', 'anext'],
    category: '🌸 Anime',
    description: 'Donne le prochain épisode et son heure de diffusion.',
    usage: `${PREFIX}airing <anime>`,
    groupOnly: false, adminOnly: false, botAdminNeeded: false,
    async execute(sock, msg, args, extra) {
      const query = args.join(' ').trim();
      if (!query) return usageError(extra, `Exemple : \`${PREFIX}airing One Piece\``);
      try {
        const media = await searchAnime(query);
        const next = media.nextAiringEpisode;
        const text = next
          ? `╭━━〔 ⏰ *PROCHAIN ÉPISODE* 〕━━╮\n┃ 📺 *${titleOf(media)}*\n┃ 🎞️ Épisode *${next.episode}*\n┃ 📅 ${fmtTimestamp(next.airingAt)}\n┃ ⏳ Dans *${fmtCountdown(next.timeUntilAiring)}*\n╰━━━━━━━━━━━━━━━━━━╯\n\n${FOOTER}`
          : `╭━━〔 ⏰ *DIFFUSION* 〕━━╮\n┃ 📺 *${titleOf(media)}*\n┃ ℹ️ Aucun prochain épisode annoncé sur AniList.\n┃ 📡 Statut : ${STATUS_NAMES[media.status] || media.status || '?'}\n╰━━━━━━━━━━━━━━━━━━╯\n\n${FOOTER}`;
        await sendOtakuResult(sock, msg, extra, {
          text, imageUrl: media.coverImage?.large,
          label: `Diffusion • ${titleOf(media)}`,
          sourceUrl: media.siteUrl,
          buttons: animeButtons(media),
        });
      } catch (error) { await errorReply(extra, 'Diffusion introuvable', error); }
    },
  },

  {
    name: 'animecalendar',
    aliases: ['anischedule', 'animeagenda'],
    category: '🌸 Anime',
    description: 'Calendrier des épisodes anime diffusés aujourd’hui.',
    usage: `${PREFIX}animecalendar`,
    groupOnly: false, adminOnly: false, botAdminNeeded: false,
    async execute(sock, msg, args, extra) {
      try {
        const now = new Date();
        const start = new Date(now); start.setHours(0, 0, 0, 0);
        const end = new Date(now); end.setHours(23, 59, 59, 999);
        const data = await anilist(`
          query ($start: Int, $end: Int) {
            Page(page: 1, perPage: 30) {
              airingSchedules(airingAt_greater: $start, airingAt_lesser: $end, sort: TIME) {
                episode airingAt
                media {
                  id title { romaji english native }
                  coverImage { large medium }
                  siteUrl isAdult
                }
              }
            }
          }
        `, { start: Math.floor(start.getTime() / 1000), end: Math.floor(end.getTime() / 1000) });
        const items = (data.Page?.airingSchedules || []).filter(x => !x.media?.isAdult).slice(0, 15);
        if (!items.length) throw new Error('Aucune diffusion trouvée aujourd’hui');
        const text = listText('╭━━〔 📅 *ANIME DU JOUR* 〕━━╮', items, (a, i) =>
          `${i + 1}. *${titleOf(a.media)}* — ép. ${a.episode}\n   🕒 ${fmtTimestamp(a.airingAt)}`
        );
        await sendOtakuResult(sock, msg, extra, {
          text, imageUrl: items[0]?.media?.coverImage?.large,
          label: 'Calendrier anime du jour',
          sourceUrl: 'https://anilist.co/airing',
          buttons: [['📅 Calendrier AniList', 'https://anilist.co/airing']],
        });
      } catch (error) { await errorReply(extra, 'Calendrier indisponible', error); }
    },
  },

  {
    name: 'anirecommend',
    aliases: ['animerecommend', 'anirec'],
    category: '🌸 Anime',
    description: 'Recommande des anime proches d’un titre donné.',
    usage: `${PREFIX}anirecommend <anime>`,
    groupOnly: false, adminOnly: false, botAdminNeeded: false,
    async execute(sock, msg, args, extra) {
      const query = args.join(' ').trim();
      if (!query) return usageError(extra, `Exemple : \`${PREFIX}anirecommend Solo Leveling\``);
      try {
        const data = await anilist(`
          query ($search: String) {
            Media(search: $search, type: ANIME, isAdult: false) {
              id title { romaji english native } coverImage { large } siteUrl
              recommendations(sort: RATING_DESC, perPage: 7) {
                nodes {
                  rating
                  mediaRecommendation {
                    id title { romaji english native }
                    averageScore coverImage { large } siteUrl isAdult
                  }
                }
              }
            }
          }
        `, { search: query });
        const base = data.Media;
        if (!base) throw new Error('Anime source introuvable');
        const recs = (base.recommendations?.nodes || [])
          .map(x => ({ ...x.mediaRecommendation, rating: x.rating }))
          .filter(x => x?.id && !x.isAdult)
          .slice(0, 6);
        if (!recs.length) throw new Error('Aucune recommandation disponible');
        const text = listText(`╭━━〔 💡 *SI TU AIMES ${titleOf(base).toUpperCase()}* 〕━━╮`, recs, (m, i) =>
          `${i + 1}. *${titleOf(m)}* — ⭐ ${m.averageScore || '?'} • 👍 ${m.rating || 0}`
        );
        await sendOtakuResult(sock, msg, extra, {
          text, imageUrl: recs[0]?.coverImage?.large || base.coverImage?.large,
          label: `Recommandations autour de ${titleOf(base)}`,
          sourceUrl: base.siteUrl,
          buttons: [['🔎 Anime source', base.siteUrl]],
        });
      } catch (error) { await errorReply(extra, 'Recommandations indisponibles', error); }
    },
  },

  {
    name: 'anigenre',
    aliases: ['animegenre', 'genreanime'],
    category: '🌸 Anime',
    description: 'Trouve des anime populaires par genre.',
    usage: `${PREFIX}anigenre <genre>`,
    groupOnly: false, adminOnly: false, botAdminNeeded: false,
    async execute(sock, msg, args, extra) {
      const genre = args.join(' ').trim();
      if (!genre) return usageError(extra, `Exemple : \`${PREFIX}anigenre Romance\``);
      try {
        const data = await anilist(`
          query ($genre: String) {
            Page(page: 1, perPage: 10) {
              media(type: ANIME, genre: $genre, isAdult: false, sort: [TRENDING_DESC, POPULARITY_DESC]) {
                ${ANIME_FIELDS}
              }
            }
          }
        `, { genre });
        const items = data.Page?.media || [];
        if (!items.length) throw new Error(`Aucun anime pour le genre « ${genre} »`);
        const text = listText(`╭━━〔 🏷️ *GENRE • ${genre.toUpperCase()}* 〕━━╮`, items, (m, i) =>
          `${i + 1}. *${titleOf(m)}* — ⭐ ${m.averageScore || '?'} • 🔥 ${fmtNumber(m.popularity)}`
        );
        await sendOtakuResult(sock, msg, extra, {
          text, imageUrl: items[0]?.coverImage?.large,
          label: `Anime • ${genre}`,
          sourceUrl: 'https://anilist.co/search/anime',
          buttons: [['🔎 Explorer AniList', 'https://anilist.co/search/anime']],
        });
      } catch (error) { await errorReply(extra, 'Genre anime indisponible', error); }
    },
  },

  {
    name: 'randomanime',
    aliases: ['animerandom', 'randanime'],
    category: '🌸 Anime',
    description: 'Découvre un anime au hasard.',
    usage: `${PREFIX}randomanime`,
    groupOnly: false, adminOnly: false, botAdminNeeded: false,
    async execute(sock, msg, args, extra) {
      try {
        const raw = await jikan('/random/anime');
        if (!raw || raw.rating === 'Rx - Hentai') throw new Error('Anime aléatoire non SFW, recommence');
        let media;
        try { media = await searchAnime(raw.title_english || raw.title); }
        catch (_) {
          media = {
            title: { english: raw.title_english, romaji: raw.title, native: raw.title_japanese },
            averageScore: raw.score ? Math.round(raw.score * 10) : null,
            popularity: raw.members,
            favourites: raw.favorites,
            status: raw.airing ? 'RELEASING' : 'FINISHED',
            format: raw.type,
            episodes: raw.episodes,
            duration: null,
            season: raw.season?.toUpperCase(),
            seasonYear: raw.year,
            studios: { nodes: raw.studios || [] },
            genres: raw.genres?.map(g => g.name) || [],
            description: raw.synopsis,
            coverImage: { extraLarge: raw.images?.jpg?.large_image_url, large: raw.images?.jpg?.image_url },
            siteUrl: raw.url,
            idMal: raw.mal_id,
          };
        }
        await sendOtakuResult(sock, msg, extra, {
          text: animeDetailText(media),
          imageUrl: media.coverImage?.extraLarge || media.coverImage?.large,
          label: `Découverte aléatoire • ${titleOf(media)}`,
          sourceUrl: media.siteUrl,
          buttons: animeButtons(media),
        });
      } catch (error) { await errorReply(extra, 'Random anime indisponible', error); }
    },
  },

  {
    name: 'character',
    aliases: ['char', 'perso', 'personnage'],
    category: '🌸 Anime',
    description: 'Recherche détaillée d’un personnage anime/manga.',
    usage: `${PREFIX}character <nom>`,
    groupOnly: false, adminOnly: false, botAdminNeeded: false,
    async execute(sock, msg, args, extra) {
      const query = args.join(' ').trim();
      if (!query) return usageError(extra, `Exemple : \`${PREFIX}character Gojo Satoru\``);
      try {
        const c = await searchCharacter(query);
        const works = c.media?.nodes?.map(m => titleOf(m)).slice(0, 5).join(' • ') || '?';
        const text =
          `╭━━〔 🎴 *PERSONNAGE* 〕━━╮\n` +
          `┃ 🌟 *${c.name?.full || query}*\n` +
          (c.name?.native ? `┃ 🇯🇵 ${c.name.native}\n` : '') +
          `┃ ⚧ *Genre :* ${c.gender || '?'}\n` +
          `┃ 🎂 *Âge :* ${c.age || '?'}\n` +
          `┃ ❤️ *Favoris :* ${fmtNumber(c.favourites)}\n` +
          `┃ 📺 *Œuvres :* ${works}\n` +
          `┃\n┃ 📝 ${truncate(c.description, 650) || 'Description indisponible.'}\n` +
          `╰━━━━━━━━━━━━━━━━━━╯\n\n${FOOTER}`;
        await sendOtakuResult(sock, msg, extra, {
          text, imageUrl: c.image?.large,
          label: `Personnage • ${c.name?.full || query}`,
          sourceUrl: c.siteUrl,
          buttons: [['🔎 Voir sur AniList', c.siteUrl]],
        });
      } catch (error) { await errorReply(extra, 'Personnage introuvable', error); }
    },
  },

  {
    name: 'manga',
    aliases: ['mangainfo', 'searchmanga'],
    category: '🌸 Anime',
    description: 'Recherche une fiche manga complète et actuelle.',
    usage: `${PREFIX}manga <titre>`,
    groupOnly: false, adminOnly: false, botAdminNeeded: false,
    async execute(sock, msg, args, extra) {
      const query = args.join(' ').trim();
      if (!query) return usageError(extra, `Exemple : \`${PREFIX}manga Dandadan\``);
      try {
        const m = await searchManga(query);
        const authors = (m.staff?.edges || [])
          .filter(e => /story|art|creator|original/i.test(e.role || ''))
          .map(e => e.node?.name?.full).filter(Boolean).slice(0, 4).join(', ') || '?';
        const text =
          `╭━━〔 📚 *MANGA INFO* 〕━━╮\n` +
          `┃ 📖 *${titleOf(m)}*\n` +
          (m.title?.native ? `┃ 🇯🇵 ${m.title.native}\n` : '') +
          `┃ ✍️ *Auteur(s) :* ${authors}\n` +
          `┃ ⭐ *Score :* ${m.averageScore || '?'} / 100\n` +
          `┃ 🔥 *Popularité :* ${fmtNumber(m.popularity)}\n` +
          `┃ ❤️ *Favoris :* ${fmtNumber(m.favourites)}\n` +
          `┃ 📕 *Volumes :* ${m.volumes || '?'}\n` +
          `┃ 📄 *Chapitres :* ${m.chapters || '?'}\n` +
          `┃ 📡 *Statut :* ${STATUS_NAMES[m.status] || m.status || '?'}\n` +
          `┃ 🏷️ *Genres :* ${(m.genres || []).slice(0, 6).join(' • ') || '?'}\n` +
          `┃\n┃ 📝 ${truncate(m.description, 700) || 'Synopsis indisponible.'}\n` +
          `╰━━━━━━━━━━━━━━━━━━╯\n\n${FOOTER}`;
        const buttons = [['🔎 Voir sur AniList', m.siteUrl]];
        if (m.idMal) buttons.push(['📚 MyAnimeList', `https://myanimelist.net/manga/${m.idMal}`]);
        await sendOtakuResult(sock, msg, extra, {
          text, imageUrl: m.coverImage?.extraLarge || m.coverImage?.large,
          label: `Manga • ${titleOf(m)}`,
          sourceUrl: m.siteUrl,
          buttons,
        });
      } catch (error) { await errorReply(extra, 'Manga introuvable', error); }
    },
  },

  {
    name: 'waifu',
    aliases: ['waifuimage', 'wife'],
    category: '🌸 Anime',
    description: 'Image waifu SFW actuelle avec source et artiste quand disponibles.',
    usage: `${PREFIX}waifu`,
    groupOnly: false, adminOnly: false, botAdminNeeded: false,
    async execute(sock, msg, args, extra) {
      try {
        const w = await getWaifuImage('waifu', false);
        const image = await downloadBuffer(w.url);
        const text =
          `╭━━〔 🌸 *WAIFU* 〕━━╮\n` +
          `┃ ✨ Sélection SFW aléatoire\n` +
          (w.artist ? `┃ 🎨 *Artiste :* ${w.artist}\n` : '') +
          (w.width && w.height ? `┃ 🖼️ *Résolution :* ${w.width}×${w.height}\n` : '') +
          `╰━━━━━━━━━━━━━━━━━━╯\n\n${FOOTER}`;
        const buttons = [];
        if (w.source) buttons.push(['🎨 Source originale', w.source]);
        await sendOtakuResult(sock, msg, extra, {
          text, imageBuffer: image, label: 'Waifu SFW • nouvelle sélection',
          sourceUrl: w.source || OTAKU_NEXUS_URL, buttons,
        });
      } catch (error) { await errorReply(extra, 'Waifu indisponible', error); }
    },
  },

  {
    name: 'waifuhd',
    aliases: ['waifupremium', 'hdwaifu'],
    category: '🌸 Anime',
    description: 'Waifu haute résolution réservée premium.',
    usage: `${PREFIX}waifuhd`,
    groupOnly: false, adminOnly: false, botAdminNeeded: false,
    async execute(sock, msg, args, extra) {
      if (premiumGuard(extra.isOwner, extra.sender, extra.reply, extra.phrases, extra.isSupremeOwner)) return;
      try {
        const w = await getWaifuImage('waifu', true);
        const image = await downloadBuffer(w.url);
        const text =
          `╭━━〔 👑 *WAIFU HD PREMIUM* 〕━━╮\n` +
          `┃ 🌸 Sélection SFW haute résolution\n` +
          (w.artist ? `┃ 🎨 ${w.artist}\n` : '') +
          (w.width && w.height ? `┃ 🖼️ ${w.width}×${w.height}\n` : '') +
          `╰━━━━━━━━━━━━━━━━━━╯\n\n${FOOTER}`;
        const buttons = w.source ? [['🎨 Source originale', w.source]] : [];
        await sendOtakuResult(sock, msg, extra, {
          text, imageBuffer: image, label: 'Waifu HD Premium',
          sourceUrl: w.source || OTAKU_NEXUS_URL, buttons,
        });
      } catch (error) { await errorReply(extra, 'Waifu HD indisponible', error); }
    },
  },

  {
    name: 'neko',
    aliases: ['catgirl', 'nekogirl'],
    category: '🌸 Anime',
    description: 'Neko SFW actuelle avec crédits de l’artiste.',
    usage: `${PREFIX}neko`,
    groupOnly: false, adminOnly: false, botAdminNeeded: false,
    async execute(sock, msg, args, extra) {
      try {
        const n = await getNekoImage();
        const image = await downloadBuffer(n.url);
        const text =
          `╭━━〔 🐾 *NEKO* 〕━━╮\n` +
          `┃ 🌙 Une neko apparaît dans le Nexus…\n` +
          (n.artist ? `┃ 🎨 *Artiste :* ${n.artist}\n` : '') +
          (n.dimensions ? `┃ 🖼️ *Résolution :* ${n.dimensions.width}×${n.dimensions.height}\n` : '') +
          `╰━━━━━━━━━━━━━━━━━━╯\n\n${FOOTER}`;
        const buttons = [];
        if (n.source) buttons.push(['🎨 Source originale', n.source]);
        if (n.artistUrl) buttons.push(['👤 Artiste', n.artistUrl]);
        await sendOtakuResult(sock, msg, extra, {
          text, imageBuffer: image, label: 'Neko SFW • nouvelle sélection',
          sourceUrl: n.source || OTAKU_NEXUS_URL, buttons,
        });
      } catch (error) { await errorReply(extra, 'Neko indisponible', error); }
    },
  },

  {
    name: 'animequote',
    aliases: ['aniquote', 'animecitation'],
    category: '🌸 Anime',
    description: 'Citation anime aléatoire avec présentation Otaku Nexus.',
    usage: `${PREFIX}animequote`,
    groupOnly: false, adminOnly: false, botAdminNeeded: false,
    async execute(sock, msg, args, extra) {
      try {
        const q = await getAnimeQuote();
        const text =
          `╭━━〔 💬 *ANIME QUOTE* 〕━━╮\n` +
          `┃ ❝ ${q.quote} ❞\n` +
          `┃\n┃ 🎴 *${q.character}*\n` +
          `┃ 📺 ${q.anime}\n` +
          `╰━━━━━━━━━━━━━━━━━━╯\n\n${FOOTER}`;
        let media = null;
        try { media = await searchAnime(q.anime); } catch (_) {}
        await sendOtakuResult(sock, msg, extra, {
          text, imageUrl: media?.coverImage?.large,
          label: `${q.character} • ${q.anime}`,
          sourceUrl: media?.siteUrl || OTAKU_NEXUS_URL,
          buttons: media ? animeButtons(media) : [],
        });
      } catch (error) { await errorReply(extra, 'Citation indisponible', error); }
    },
  },

  {
    name: 'opening',
    aliases: ['animeop', 'op'],
    category: '🌸 Anime',
    description: 'Recherche les openings actuels d’un anime.',
    usage: `${PREFIX}opening <anime>`,
    groupOnly: false, adminOnly: false, botAdminNeeded: false,
    async execute(sock, msg, args, extra) {
      const query = args.join(' ').trim();
      if (!query) return usageError(extra, `Exemple : \`${PREFIX}opening Dandadan\``);
      try {
        const search = await jikan('/anime', { q: query, limit: 1, sfw: true });
        const item = search?.[0];
        if (!item?.mal_id) throw new Error('Anime introuvable');
        const full = await jikan(`/anime/${item.mal_id}/full`);
        const openings = full?.theme?.openings || [];
        const title = full?.title_english || full?.title || query;
        const opText = openings.length
          ? openings.slice(0, 8).map((op, i) => `${i + 1}. ${op}`).join('\n')
          : 'Aucun opening référencé actuellement.';
        const youtubeSearch = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${title} opening official`)}`;
        const text = `╭━━〔 🎵 *OPENINGS • ${title}* 〕━━╮\n${opText}\n╰━━━━━━━━━━━━━━━━━━╯\n\n${FOOTER}`;
        await sendOtakuResult(sock, msg, extra, {
          text,
          imageUrl: full?.images?.jpg?.large_image_url || full?.images?.jpg?.image_url,
          label: `Openings • ${title}`,
          sourceUrl: full?.url,
          buttons: [['▶️ Rechercher sur YouTube', youtubeSearch], ['📚 MyAnimeList', full?.url]],
        });
      } catch (error) { await errorReply(extra, 'Opening indisponible', error); }
    },
  },

  {
    name: 'openingvip',
    aliases: ['opvip', 'openingpremium'],
    category: '🌸 Anime',
    description: 'Recherche premium des openings avec accès direct aux résultats vidéo.',
    usage: `${PREFIX}openingvip <anime>`,
    groupOnly: false, adminOnly: false, botAdminNeeded: false,
    async execute(sock, msg, args, extra) {
      if (premiumGuard(extra.isOwner, extra.sender, extra.reply, extra.phrases, extra.isSupremeOwner)) return;
      const query = args.join(' ').trim();
      if (!query) return usageError(extra, `Exemple : \`${PREFIX}openingvip Solo Leveling\``);
      try {
        const media = await searchAnime(query);
        const youtube = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${titleOf(media)} opening full official`)}`;
        const text = `╭━━〔 👑 *OPENING VIP* 〕━━╮\n┃ 📺 *${titleOf(media)}*\n┃ 🎧 Recherche : opening complet / officiel\n┃ ✨ Accès premium Otaku Nexus\n╰━━━━━━━━━━━━━━━━━━╯\n\n${FOOTER}`;
        await sendOtakuResult(sock, msg, extra, {
          text, imageUrl: media.coverImage?.extraLarge || media.coverImage?.large,
          label: `Opening VIP • ${titleOf(media)}`,
          sourceUrl: media.siteUrl,
          buttons: [['▶️ Opening complet', youtube], ...animeButtons(media).slice(0, 2)],
        });
      } catch (error) { await errorReply(extra, 'Opening VIP indisponible', error); }
    },
  },

  {
    name: 'amv',
    aliases: ['animemv', 'musicvideo'],
    category: '🌸 Anime',
    description: 'Trouve rapidement des AMV pour un anime actuel.',
    usage: `${PREFIX}amv <anime>`,
    groupOnly: false, adminOnly: false, botAdminNeeded: false,
    async execute(sock, msg, args, extra) {
      const query = args.join(' ').trim();
      try {
        let media;
        if (query) media = await searchAnime(query);
        else {
          const { season, year } = currentSeason();
          media = (await listSeasonAnime(season, year, ['TRENDING_DESC'], 1))[0];
        }
        if (!media) throw new Error('Anime introuvable');
        const youtube = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${titleOf(media)} AMV`)}`;
        const text = `╭━━〔 🎬 *AMV FINDER* 〕━━╮\n┃ 📺 *${titleOf(media)}*\n┃ 🎵 AMV récents disponibles via la recherche ci-dessous.\n╰━━━━━━━━━━━━━━━━━━╯\n\n${FOOTER}`;
        await sendOtakuResult(sock, msg, extra, {
          text, imageUrl: media.coverImage?.large,
          label: `AMV • ${titleOf(media)}`,
          sourceUrl: media.siteUrl,
          buttons: [['🎬 Chercher des AMV', youtube], ...animeButtons(media).slice(0, 2)],
        });
      } catch (error) { await errorReply(extra, 'AMV indisponible', error); }
    },
  },

  {
    name: 'amvhd',
    aliases: ['amvpremium', 'hdamv'],
    category: '🌸 Anime',
    description: 'Recherche premium d’AMV HD/4K.',
    usage: `${PREFIX}amvhd <anime>`,
    groupOnly: false, adminOnly: false, botAdminNeeded: false,
    async execute(sock, msg, args, extra) {
      if (premiumGuard(extra.isOwner, extra.sender, extra.reply, extra.phrases, extra.isSupremeOwner)) return;
      const query = args.join(' ').trim();
      if (!query) return usageError(extra, `Exemple : \`${PREFIX}amvhd Jujutsu Kaisen\``);
      try {
        const media = await searchAnime(query);
        const youtube = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${titleOf(media)} AMV 4K 60FPS`)}`;
        const text = `╭━━〔 👑 *AMV HD / 4K* 〕━━╮\n┃ 📺 *${titleOf(media)}*\n┃ 🎞️ Recherche 4K / 60FPS prête.\n╰━━━━━━━━━━━━━━━━━━╯\n\n${FOOTER}`;
        await sendOtakuResult(sock, msg, extra, {
          text, imageUrl: media.coverImage?.extraLarge || media.coverImage?.large,
          label: `AMV HD • ${titleOf(media)}`,
          sourceUrl: media.siteUrl,
          buttons: [['🎬 AMV 4K / 60FPS', youtube], ...animeButtons(media).slice(0, 2)],
        });
      } catch (error) { await errorReply(extra, 'AMV HD indisponible', error); }
    },
  },

  {
    name: 'cosplay',
    aliases: ['cos', 'cosplayer'],
    category: '🌸 Anime',
    description: 'Illustration anime inspirée cosplay, SFW et sourcée.',
    usage: `${PREFIX}cosplay`,
    groupOnly: false, adminOnly: false, botAdminNeeded: false,
    async execute(sock, msg, args, extra) {
      try {
        let w;
        try { w = await getWaifuImage('cosplay', false); }
        catch (_) { w = await getWaifuImage('waifu', false); }
        const image = await downloadBuffer(w.url);
        const text = `╭━━〔 🎭 *COSPLAY / ANIME ART* 〕━━╮\n┃ ✨ Sélection SFW du Nexus\n${w.artist ? `┃ 🎨 ${w.artist}\n` : ''}╰━━━━━━━━━━━━━━━━━━╯\n\n${FOOTER}`;
        await sendOtakuResult(sock, msg, extra, {
          text, imageBuffer: image, label: 'Cosplay / Anime Art SFW',
          sourceUrl: w.source || OTAKU_NEXUS_URL,
          buttons: w.source ? [['🎨 Source originale', w.source]] : [],
        });
      } catch (error) { await errorReply(extra, 'Cosplay indisponible', error); }
    },
  },

  {
    name: 'cosplayvip',
    aliases: ['cosplaypremium', 'hdcosplay'],
    category: '🌸 Anime',
    description: 'Sélection cosplay/anime art haute résolution premium.',
    usage: `${PREFIX}cosplayvip`,
    groupOnly: false, adminOnly: false, botAdminNeeded: false,
    async execute(sock, msg, args, extra) {
      if (premiumGuard(extra.isOwner, extra.sender, extra.reply, extra.phrases, extra.isSupremeOwner)) return;
      try {
        let w;
        try { w = await getWaifuImage('cosplay', true); }
        catch (_) { w = await getWaifuImage('waifu', true); }
        const image = await downloadBuffer(w.url);
        const text = `╭━━〔 👑 *COSPLAY VIP HD* 〕━━╮\n┃ 🎭 Sélection SFW haute résolution\n${w.artist ? `┃ 🎨 ${w.artist}\n` : ''}${w.width && w.height ? `┃ 🖼️ ${w.width}×${w.height}\n` : ''}╰━━━━━━━━━━━━━━━━━━╯\n\n${FOOTER}`;
        await sendOtakuResult(sock, msg, extra, {
          text, imageBuffer: image, label: 'Cosplay VIP HD',
          sourceUrl: w.source || OTAKU_NEXUS_URL,
          buttons: w.source ? [['🎨 Source originale', w.source]] : [],
        });
      } catch (error) { await errorReply(extra, 'Cosplay VIP indisponible', error); }
    },
  },
];
