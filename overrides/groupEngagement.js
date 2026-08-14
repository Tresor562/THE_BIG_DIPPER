'use strict';

/**
 * THE BIG DIPPER — Group engagement visuals
 * - Level-up cards driven by utils/groupstats.js
 * - Daily random couple with a persisted random time
 * - Same 1536x768 visual canvas as welcome/goodbye
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');
const config = require('../config');
const database = require('../database');
const styleManager = require('./styleManager');
const groupstats = require('./groupstats');
const sessionContext = require('./sessionContext');
const {
  proto,
  prepareWAMessageMedia,
  generateWAMessageFromContent,
} = require('@whiskeysockets/baileys');

const WIDTH = 1536;
const HEIGHT = 768;
const AVATAR = 286;
const COUPLE_AVATAR = 264;
const BOT_URL = 'https://the-big-dipper.onrender.com';
const NEXUS_TECH_URL = 'https://whatsapp.com/channel/0029VbDkWGYHltYHGr1HHQ07';
const TIMEZONE = 'Africa/Porto-Novo';
const USER_AGENT = 'THE-BIG-DIPPER/1.0';
const schedulerBySock = new WeakMap();

const STYLE_ACCENTS = [
  '#FFD54A', '#9C7CFF', '#FF9F43', '#9B59B6', '#00FF88', '#6C5CE7',
  '#FF5AA5', '#FF7AC8', '#64B5F6', '#90A4AE', '#FF8FB1', '#6C5CE7',
  '#D32F2F', '#B39DDB', '#7E57C2', '#8D6E63', '#D32F2F', '#F5F5F5',
  '#4FC3F7', '#7E57C2', '#FF7043',
];

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function normalizeNumber(jid) {
  return String(jid || '').split(':')[0].split('@')[0].replace(/\D/g, '');
}

function participantJid(p) {
  return p?.jid || p?.phoneJid || p?.userJid || p?.id || p?.lid || null;
}

function urlButton(label, url) {
  return {
    name: 'cta_url',
    buttonParamsJson: JSON.stringify({ display_text: label, url, merchant_url: url }),
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

function newsletterContext(body, mentions = []) {
  return {
    forwardingScore: 999,
    isForwarded: true,
    mentionedJid: mentions.filter(Boolean),
    forwardedNewsletterMessageInfo: {
      newsletterJid: config.newsletterJid || '120363411005383995@newsletter',
      newsletterName: config.botName || 'THE BIG DIPPER',
      serverMessageId: -1,
    },
    externalAdReply: {
      showAdAttribution: false,
      title: 'THE BIG DIPPER • GROUP LIFE',
      body: String(body || 'Communauté & participation').slice(0, 90),
      mediaType: 1,
      sourceUrl: BOT_URL,
      mediaUrl: BOT_URL,
      renderLargerThumbnail: false,
    },
  };
}

async function sendInteractiveImage(sock, jid, imageBuffer, body, options = {}) {
  const mentions = Array.isArray(options.mentions) ? options.mentions : [];
  const buttons = [
    urlButton('🌐 Connecter le bot', BOT_URL),
    urlButton('📢 Nexus Tech', NEXUS_TECH_URL),
  ];

  try {
    const media = await prepareWAMessageMedia(
      { image: imageBuffer },
      { upload: sock.waUploadToServer }
    );
    const interactiveMessage = proto.Message.InteractiveMessage.create({
      body: proto.Message.InteractiveMessage.Body.create({ text: body }),
      footer: proto.Message.InteractiveMessage.Footer.create({ text: '' }),
      header: proto.Message.InteractiveMessage.Header.create({
        ...media,
        title: '',
        subtitle: '',
        hasMediaAttachment: true,
      }),
      nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
        buttons,
        messageParamsJson: '{}',
        messageVersion: 1,
      }),
      contextInfo: newsletterContext(options.newsletterBody || body, mentions),
    });
    const generated = generateWAMessageFromContent(
      jid,
      { interactiveMessage },
      { quoted: options.quoted || undefined, userJid: sock.user?.id }
    );
    await sock.relayMessage(jid, generated.message, {
      messageId: generated.key.id,
      additionalNodes: buildBizNodes(jid),
    });
    return generated;
  } catch (err) {
    console.warn('[groupEngagement] interactive fallback:', err.message);
    return sock.sendMessage(jid, {
      image: imageBuffer,
      caption: body,
      mentions,
      contextInfo: newsletterContext(options.newsletterBody || body, mentions),
    }, options.quoted ? { quoted: options.quoted } : undefined);
  }
}

async function fetchBuffer(url) {
  if (!url || !/^https?:\/\//i.test(String(url))) return null;
  try {
    const res = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 7000,
      maxRedirects: 4,
      maxContentLength: 8 * 1024 * 1024,
      headers: { 'User-Agent': USER_AGENT },
    });
    const buf = Buffer.from(res.data || []);
    return buf.length >= 256 ? buf : null;
  } catch (_) { return null; }
}

function fallbackAvatar(accent, size = AVATAR) {
  const c = size / 2;
  return Buffer.from(`
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <defs><radialGradient id="a"><stop offset="0" stop-color="${accent}"/><stop offset="1" stop-color="#151823"/></radialGradient></defs>
      <rect width="100%" height="100%" fill="url(#a)"/>
      <circle cx="${c}" cy="${Math.round(size * 0.38)}" r="${Math.round(size * 0.19)}" fill="#fff" fill-opacity="0.78"/>
      <ellipse cx="${c}" cy="${Math.round(size * 0.86)}" rx="${Math.round(size * 0.33)}" ry="${Math.round(size * 0.29)}" fill="#fff" fill-opacity="0.78"/>
    </svg>`);
}

async function circularAvatar(input, accent, size = AVATAR) {
  const source = input || fallbackAvatar(accent, size);
  const mask = Buffer.from(`<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`);
  return sharp(source)
    .resize(size, size, { fit: 'cover', position: 'centre' })
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

function fallbackBackground(style, accent) {
  let styleName = `Style ${style}`;
  try { styleName = styleManager.getStyleName(style) || styleName; } catch (_) {}
  return Buffer.from(`
    <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#070910"/>
          <stop offset="0.55" stop-color="#151925"/>
          <stop offset="1" stop-color="${accent}" stop-opacity="0.5"/>
        </linearGradient>
        <radialGradient id="r" cx="50%" cy="44%" r="60%">
          <stop offset="0" stop-color="${accent}" stop-opacity="0.25"/>
          <stop offset="1" stop-color="#000" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#g)"/>
      <rect width="100%" height="100%" fill="url(#r)"/>
      <text x="50%" y="95%" text-anchor="middle" fill="#fff" fill-opacity="0.15" font-size="28" font-family="DejaVu Sans,Arial">${escapeXml(styleName)}</text>
    </svg>`);
}

async function styledBackground(style, accent) {
  try {
    const menu = require('../commands/general_tools/menu');
    if (typeof menu.getImageBufferForStyle === 'function') {
      const image = await menu.getImageBufferForStyle(style);
      if (image) {
        return sharp(image)
          .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'centre' })
          .modulate({ brightness: 0.7, saturation: 1.12 })
          .png()
          .toBuffer();
      }
    }
  } catch (_) {}
  return sharp(fallbackBackground(style, accent)).png().toBuffer();
}

async function profileBuffer(sock, jid) {
  let url = null;
  try {
    url = await Promise.race([
      sock.profilePictureUrl(jid, 'image'),
      new Promise(resolve => setTimeout(() => resolve(null), 4500)),
    ]);
  } catch (_) {}
  return fetchBuffer(url);
}

async function memberName(sock, jid, participant, metadata) {
  try {
    const wc = require('./welcomeCard');
    if (typeof wc.resolveMemberName === 'function') {
      return await wc.resolveMemberName(sock, jid, participant, metadata);
    }
  } catch (_) {}
  const num = normalizeNumber(jid);
  return participant?.notify || participant?.name || participant?.pushName || num || 'Membre';
}

async function buildLevelCard(sock, groupId, jid, info, options = {}) {
  const style = styleManager.getStyle();
  const accent = STYLE_ACCENTS[style] || STYLE_ACCENTS[0];
  let metadata = options.metadata;
  if (!metadata) {
    try { metadata = await sock.groupMetadata(groupId); } catch (_) { metadata = { participants: [] }; }
  }
  const participant = (metadata?.participants || []).find(p => normalizeNumber(participantJid(p)) === normalizeNumber(jid));
  const name = await memberName(sock, jid, participant, metadata);
  const avatar = await circularAvatar(await profileBuffer(sock, jid), accent, AVATAR);
  const bg = await styledBackground(style, accent);
  const progressWidth = Math.round(820 * Math.max(0, Math.min(1, Number(info.progress) || 0)));
  const safeName = escapeXml(String(name).slice(0, 42));
  const nameSize = String(name).length > 28 ? 48 : String(name).length > 18 ? 58 : 68;
  const levelUp = !!options.levelUp;
  const topTitle = levelUp ? 'LEVEL UP' : 'GROUP LEVEL';
  const bottom = levelUp ? `LEVEL UP  •  LEVEL ${info.level}` : `LEVEL ${info.level}`;

  const overlay = Buffer.from(`
    <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.40"/><stop offset="1" stop-color="#000" stop-opacity="0.65"/></linearGradient>
        <filter id="glow"><feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <rect width="100%" height="100%" fill="url(#shade)"/>
      <rect x="0" y="54" width="1536" height="124" fill="#000" fill-opacity="0.34"/>
      <rect x="0" y="606" width="1536" height="126" fill="#000" fill-opacity="0.42"/>
      <circle cx="338" cy="374" r="158" fill="#000" fill-opacity="0.40"/>
      <circle cx="338" cy="374" r="151" fill="none" stroke="${accent}" stroke-width="8" filter="url(#glow)"/>
      <text x="768" y="140" text-anchor="middle" fill="${accent}" font-size="82" font-weight="900" font-family="DejaVu Sans,Arial" filter="url(#glow)">${topTitle}</text>
      <text x="570" y="315" fill="#fff" font-size="${nameSize}" font-weight="800" font-family="DejaVu Sans,Arial">${safeName}</text>
      <text x="570" y="392" fill="${accent}" font-size="62" font-weight="900" font-family="DejaVu Sans,Arial">Level ${info.level}</text>
      <text x="570" y="452" fill="#fff" fill-opacity="0.88" font-size="34" font-family="DejaVu Sans,Arial">${info.messages} messages • prochain niveau à ${info.nextLevelAt}</text>
      <rect x="570" y="490" width="820" height="34" rx="17" fill="#fff" fill-opacity="0.18"/>
      <rect x="570" y="490" width="${progressWidth}" height="34" rx="17" fill="${accent}"/>
      <text x="768" y="690" text-anchor="middle" fill="${accent}" font-size="66" font-weight="900" font-family="DejaVu Sans,Arial" filter="url(#glow)">${bottom}</text>
    </svg>`);

  const buffer = await sharp(bg)
    .composite([
      { input: overlay, left: 0, top: 0 },
      { input: avatar, left: 338 - Math.round(AVATAR / 2), top: 374 - Math.round(AVATAR / 2) },
    ])
    .jpeg({ quality: 89, chromaSubsampling: '4:4:4' })
    .toBuffer();

  return { buffer, name, style };
}

async function sendLevelCard(sock, groupId, jid, info, options = {}) {
  const built = await buildLevelCard(sock, groupId, jid, info, options);
  const num = normalizeNumber(jid);
  const body = options.levelUp
    ? `🎉 *LEVEL UP !*\n@${num} passe au *niveau ${info.level}* avec *${info.messages} messages* dans ce groupe.`
    : `🎮 *NIVEAU DU GROUPE*\n@${num} est *niveau ${info.level}* avec *${info.messages} messages*.\nProchain niveau : *${info.nextLevelAt} messages*.`;
  await sendInteractiveImage(sock, groupId, built.buffer, body, {
    mentions: [jid],
    quoted: options.quoted,
    newsletterBody: options.levelUp ? `Level Up • Niveau ${info.level}` : `Group Level • Niveau ${info.level}`,
  });
  return built;
}

async function handleLevelProgress(sock, msg, statsResult) {
  if (!statsResult?.leveledUp || !statsResult?.groupId || !statsResult?.sender) return false;
  if (msg?.key?.fromMe) return false;
  const settings = database.getGroupSettings(statsResult.groupId);
  if (settings?.grouplevel === false) return false;
  try {
    await sendLevelCard(sock, statsResult.groupId, statsResult.sender, statsResult, { levelUp: true });
    return true;
  } catch (err) {
    console.error('[grouplevel] level-up card failed:', err.message);
    return false;
  }
}

function coupleFile() {
  const sessionId = sessionContext.getCurrentSessionId();
  const dir = path.join(process.cwd(), 'database', 'sessions', sessionId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'coupleDay.json');
}

function readCoupleState() {
  try {
    const file = coupleFile();
    if (!fs.existsSync(file)) return {};
    return JSON.parse(fs.readFileSync(file, 'utf8')) || {};
  } catch (_) { return {}; }
}

function writeCoupleState(data) {
  try { fs.writeFileSync(coupleFile(), JSON.stringify(data, null, 2), 'utf8'); }
  catch (err) { console.error('[coupleday] state write:', err.message); }
}

function localClock(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  const hour = Number(parts.hour) || 0;
  const minute = Number(parts.minute) || 0;
  return { day, hour, minute, minuteOfDay: hour * 60 + minute };
}

function randomMinute() {
  // Random human-friendly slot: 08:00 → 22:30 local time.
  const start = 8 * 60;
  const end = 22 * 60 + 30;
  return start + Math.floor(Math.random() * (end - start + 1));
}

function formatMinute(value) {
  const min = Math.max(0, Math.min(1439, Number(value) || 0));
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

function ensureCoupleSchedule(groupId) {
  const state = readCoupleState();
  const now = localClock();
  const previous = state[groupId] || {};
  if (previous.date !== now.day) {
    state[groupId] = {
      date: now.day,
      targetMinute: randomMinute(),
      sent: false,
      lastPair: Array.isArray(previous.lastPair) ? previous.lastPair : [],
    };
    writeCoupleState(state);
  }
  return { ...state[groupId], targetLabel: formatMinute(state[groupId].targetMinute) };
}

function markCoupleSent(groupId, pair) {
  const state = readCoupleState();
  const schedule = ensureCoupleSchedule(groupId);
  state[groupId] = { ...schedule, sent: true, lastPair: pair };
  delete state[groupId].targetLabel;
  writeCoupleState(state);
}

function chooseCouple(participants, lastPair, sock) {
  const botNums = new Set([
    normalizeNumber(sock.user?.id), normalizeNumber(sock.user?.jid), normalizeNumber(sock.user?.lid),
  ].filter(Boolean));
  const eligible = participants
    .map(p => ({ participant: p, jid: participantJid(p) }))
    .filter(x => x.jid && !botNums.has(normalizeNumber(x.jid)));
  if (eligible.length < 2) return null;

  const shuffled = [...eligible].sort(() => Math.random() - 0.5);
  let first = shuffled[0];
  let second = shuffled.find(x => normalizeNumber(x.jid) !== normalizeNumber(first.jid));
  if (!second) return null;

  const last = new Set((lastPair || []).map(normalizeNumber));
  if (eligible.length > 2 && last.has(normalizeNumber(first.jid)) && last.has(normalizeNumber(second.jid))) {
    const alternate = shuffled.find(x => !last.has(normalizeNumber(x.jid)) && normalizeNumber(x.jid) !== normalizeNumber(first.jid));
    if (alternate) second = alternate;
  }
  return [first, second];
}

async function buildCoupleCard(sock, groupId, pair, metadata) {
  const style = styleManager.getStyle();
  const accent = STYLE_ACCENTS[style] || STYLE_ACCENTS[0];
  const loveAccent = '#FF5B9F';
  const [a, b] = pair;
  const [nameA, nameB, photoA, photoB] = await Promise.all([
    memberName(sock, a.jid, a.participant, metadata),
    memberName(sock, b.jid, b.participant, metadata),
    profileBuffer(sock, a.jid),
    profileBuffer(sock, b.jid),
  ]);
  const [avatarA, avatarB] = await Promise.all([
    circularAvatar(photoA, loveAccent, COUPLE_AVATAR),
    circularAvatar(photoB, loveAccent, COUPLE_AVATAR),
  ]);
  const bg = await styledBackground(style, accent);
  const safeA = escapeXml(String(nameA).slice(0, 28));
  const safeB = escapeXml(String(nameB).slice(0, 28));

  const hearts = Array.from({ length: 18 }, (_, i) => {
    const x = 90 + ((i * 83) % 1350);
    const y = 120 + ((i * 137) % 500);
    const size = 20 + (i % 4) * 7;
    const opacity = (0.16 + (i % 5) * 0.08).toFixed(2);
    return `<text x="${x}" y="${y}" fill="${loveAccent}" fill-opacity="${opacity}" font-size="${size}" font-family="DejaVu Sans,Arial">♥</text>`;
  }).join('');

  const overlay = Buffer.from(`
    <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="love" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${loveAccent}" stop-opacity="0.32"/><stop offset="1" stop-color="${loveAccent}" stop-opacity="0"/></radialGradient>
        <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.32"/><stop offset="1" stop-color="#000" stop-opacity="0.62"/></linearGradient>
        <filter id="glow"><feGaussianBlur stdDeviation="8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <rect width="100%" height="100%" fill="url(#shade)"/>
      <ellipse cx="768" cy="380" rx="540" ry="330" fill="url(#love)"/>
      ${hearts}
      <rect x="0" y="52" width="1536" height="126" fill="#000" fill-opacity="0.34"/>
      <rect x="0" y="600" width="1536" height="132" fill="#000" fill-opacity="0.40"/>
      <circle cx="470" cy="365" r="149" fill="#000" fill-opacity="0.38"/>
      <circle cx="470" cy="365" r="140" fill="none" stroke="${loveAccent}" stroke-width="9" filter="url(#glow)"/>
      <circle cx="1066" cy="365" r="149" fill="#000" fill-opacity="0.38"/>
      <circle cx="1066" cy="365" r="140" fill="none" stroke="${loveAccent}" stroke-width="9" filter="url(#glow)"/>
      <text x="768" y="138" text-anchor="middle" fill="${loveAccent}" font-size="76" font-weight="900" font-family="DejaVu Sans,Arial" filter="url(#glow)">COUPLE DU JOUR</text>
      <text x="768" y="410" text-anchor="middle" fill="${loveAccent}" font-size="128" font-family="DejaVu Sans,Arial" filter="url(#glow)">♥</text>
      <text x="470" y="568" text-anchor="middle" fill="#fff" font-size="46" font-weight="800" font-family="DejaVu Sans,Arial">${safeA}</text>
      <text x="1066" y="568" text-anchor="middle" fill="#fff" font-size="46" font-weight="800" font-family="DejaVu Sans,Arial">${safeB}</text>
      <text x="768" y="689" text-anchor="middle" fill="${loveAccent}" font-size="54" font-weight="900" font-family="DejaVu Sans,Arial">TWO HEARTS • ONE DAY</text>
    </svg>`);

  const buffer = await sharp(bg)
    .composite([
      { input: overlay, left: 0, top: 0 },
      { input: avatarA, left: 470 - Math.round(COUPLE_AVATAR / 2), top: 365 - Math.round(COUPLE_AVATAR / 2) },
      { input: avatarB, left: 1066 - Math.round(COUPLE_AVATAR / 2), top: 365 - Math.round(COUPLE_AVATAR / 2) },
    ])
    .jpeg({ quality: 89, chromaSubsampling: '4:4:4' })
    .toBuffer();
  return { buffer, nameA, nameB };
}

async function runCoupleDay(sock, groupId, options = {}) {
  const settings = database.getGroupSettings(groupId);
  if (!options.force && settings?.coupleday === false) return { skipped: 'disabled' };

  const schedule = ensureCoupleSchedule(groupId);
  if (!options.force && schedule.sent) return { skipped: 'already-sent', schedule };

  let metadata;
  try { metadata = await sock.groupMetadata(groupId); }
  catch (err) { return { skipped: 'metadata', error: err }; }

  const pair = chooseCouple(metadata.participants || [], schedule.lastPair, sock);
  if (!pair) return { skipped: 'not-enough-members', schedule };
  const built = await buildCoupleCard(sock, groupId, pair, metadata);
  const jidA = pair[0].jid;
  const jidB = pair[1].jid;
  const body = `💞 *COUPLE DU JOUR* 💞\n@${normalizeNumber(jidA)} × @${normalizeNumber(jidB)}\n\n💗 Le hasard de THE BIG DIPPER vous réunit aujourd'hui. Prenez ça avec humour et bonne humeur 😄`;
  await sendInteractiveImage(sock, groupId, built.buffer, body, {
    mentions: [jidA, jidB],
    newsletterBody: `Couple du jour • ${built.nameA} × ${built.nameB}`,
  });
  markCoupleSent(groupId, [jidA, jidB]);
  return { sent: true, pair: [jidA, jidB], schedule: ensureCoupleSchedule(groupId) };
}

async function coupleTick(sock) {
  let groups;
  try { groups = await sock.groupFetchAllParticipating(); }
  catch (err) {
    console.warn('[coupleday] group list unavailable:', err.message);
    return;
  }
  const now = localClock();
  for (const groupId of Object.keys(groups || {})) {
    try {
      const settings = database.getGroupSettings(groupId);
      if (settings?.coupleday === false) continue;
      const schedule = ensureCoupleSchedule(groupId);
      if (!schedule.sent && now.minuteOfDay >= Number(schedule.targetMinute)) {
        await runCoupleDay(sock, groupId);
      }
    } catch (err) {
      console.warn(`[coupleday] ${groupId}:`, err.message);
    }
  }
}

function startCoupleDayScheduler(sock, sessionId = sessionContext.DEFAULT_SESSION_ID) {
  if (!sock || schedulerBySock.has(sock)) return schedulerBySock.get(sock) || null;
  let stopped = false;
  const execute = () => sessionContext.run(sessionId, () => coupleTick(sock)).catch(err => {
    console.warn('[coupleday] tick:', err.message);
  });
  const first = setTimeout(execute, 45 * 1000);
  const timer = setInterval(execute, 5 * 60 * 1000);
  if (first.unref) first.unref();
  if (timer.unref) timer.unref();

  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(first);
    clearInterval(timer);
    schedulerBySock.delete(sock);
  };
  const connectionListener = update => {
    if (update?.connection === 'close') {
      stop();
      try { sock.ev?.off?.('connection.update', connectionListener); } catch (_) {}
    }
  };
  try { sock.ev?.on?.('connection.update', connectionListener); } catch (_) {}
  const state = { timer, first, stop, sessionId };
  schedulerBySock.set(sock, state);
  return state;
}

module.exports = {
  WIDTH,
  HEIGHT,
  buildLevelCard,
  sendLevelCard,
  handleLevelProgress,
  runCoupleDay,
  startCoupleDayScheduler,
  ensureCoupleSchedule,
  formatMinute,
  newsletterContext,
  sendInteractiveImage,
};
