'use strict';

const axios = require('axios');
const sharp = require('sharp');
const config = require('../config');
const styleManager = require('./styleManager');

const WIDTH = 1536;
const HEIGHT = 768;
const AVATAR = 286;

const STYLE_ACCENTS = [
  '#FFD54A', '#9C7CFF', '#FF9F43', '#9B59B6', '#00FF88', '#6C5CE7',
  '#FF5AA5', '#FF7AC8', '#64B5F6', '#90A4AE', '#FF8FB1', '#6C5CE7',
  '#D32F2F', '#B39DDB', '#7E57C2', '#8D6E63', '#D32F2F', '#F5F5F5',
  '#4FC3F7', '#7E57C2', '#FF7043'
];

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeNumber(jid) {
  return String(jid || '').split(':')[0].split('@')[0].replace(/\D/g, '');
}

function cleanName(value) {
  const v = String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (!v || /^\d{7,}$/.test(v)) return null;
  return v.slice(0, 48);
}

async function resolveMemberName(sock, participantJid, participant, groupMetadata) {
  const number = normalizeNumber(participantJid);
  const candidates = [
    participant?.notify,
    participant?.name,
    participant?.pushName,
    participant?.verifiedName,
    participant?.subject,
  ];

  const metaEntry = (groupMetadata?.participants || []).find(p => {
    const ids = [p?.id, p?.jid, p?.lid, p?.userJid, p?.phoneJid, p?.phoneNumber].filter(Boolean);
    return ids.some(id => normalizeNumber(id) === number || id === participantJid);
  });
  if (metaEntry) {
    candidates.push(metaEntry.notify, metaEntry.name, metaEntry.pushName, metaEntry.verifiedName);
  }

  const knownNames = global._dipperMemberNames;
  if (knownNames instanceof Map) {
    candidates.push(knownNames.get(participantJid), knownNames.get(number));
  }

  const possibleContacts = [sock?.contacts, sock?.store?.contacts, sock?.authState?.contacts].filter(Boolean);
  for (const contacts of possibleContacts) {
    const c = contacts[participantJid] || contacts[number] || contacts[`${number}@s.whatsapp.net`];
    if (c) candidates.push(c.name, c.notify, c.verifiedName, c.pushName);
  }

  for (const candidate of candidates) {
    const cleaned = cleanName(candidate);
    if (cleaned) return cleaned;
  }

  if (typeof sock?.getName === 'function') {
    try {
      const resolved = cleanName(await Promise.race([
        sock.getName(participantJid),
        new Promise(resolve => setTimeout(() => resolve(null), 2500)),
      ]));
      if (resolved) return resolved;
    } catch (_) {}
  }

  return number || 'Membre';
}

async function fetchBuffer(url) {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    const res = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 8000,
      maxRedirects: 5,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.data || res.data.byteLength < 256) return null;
    return Buffer.from(res.data);
  } catch (_) {
    return null;
  }
}

function fallbackBackground(style, accent) {
  const styleName = escapeXml(styleManager.getStyleName(style));
  return Buffer.from(`
    <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#090B10"/>
          <stop offset="0.55" stop-color="#151925"/>
          <stop offset="1" stop-color="${accent}" stop-opacity="0.48"/>
        </linearGradient>
        <radialGradient id="r" cx="50%" cy="45%" r="58%">
          <stop offset="0" stop-color="${accent}" stop-opacity="0.28"/>
          <stop offset="1" stop-color="#000" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#g)"/>
      <rect width="100%" height="100%" fill="url(#r)"/>
      <text x="50%" y="95%" text-anchor="middle" fill="#fff" fill-opacity="0.16"
            font-size="28" font-family="DejaVu Sans, Arial, sans-serif">${styleName}</text>
    </svg>`);
}

function fallbackAvatar(accent) {
  return Buffer.from(`
    <svg width="${AVATAR}" height="${AVATAR}" xmlns="http://www.w3.org/2000/svg">
      <defs><radialGradient id="a"><stop offset="0" stop-color="${accent}"/><stop offset="1" stop-color="#171A22"/></radialGradient></defs>
      <rect width="100%" height="100%" fill="url(#a)"/>
      <circle cx="143" cy="108" r="54" fill="#fff" fill-opacity="0.75"/>
      <ellipse cx="143" cy="244" rx="94" ry="82" fill="#fff" fill-opacity="0.75"/>
    </svg>`);
}

async function circularAvatar(input, accent) {
  const source = input || fallbackAvatar(accent);
  const mask = Buffer.from(`<svg width="${AVATAR}" height="${AVATAR}" xmlns="http://www.w3.org/2000/svg"><circle cx="${AVATAR / 2}" cy="${AVATAR / 2}" r="${AVATAR / 2}" fill="#fff"/></svg>`);
  return sharp(source)
    .resize(AVATAR, AVATAR, { fit: 'cover', position: 'centre' })
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

async function buildGroupEventCard({ profilePicUrl, memberName, type = 'welcome' }) {
  const style = styleManager.getStyle();
  const accent = STYLE_ACCENTS[style] || STYLE_ACCENTS[0];
  const title = type === 'goodbye' ? 'Au-revoir' : 'Bienvenue';
  const safeName = escapeXml(memberName || 'Membre');
  const nameSize = memberName?.length > 30 ? 48 : memberName?.length > 22 ? 56 : memberName?.length > 14 ? 66 : 78;

  let background = null;
  try {
    const menu = require('../commands/general_tools/menu');
    if (typeof menu.getImageBufferForStyle === 'function') {
      background = await menu.getImageBufferForStyle(style);
    }
  } catch (_) {}
  if (!background) background = fallbackBackground(style, accent);

  const profile = await fetchBuffer(profilePicUrl);
  const avatar = await circularAvatar(profile, accent);

  const overlay = Buffer.from(`
    <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#000" stop-opacity="0.38"/>
          <stop offset="0.5" stop-color="#000" stop-opacity="0.15"/>
          <stop offset="1" stop-color="#000" stop-opacity="0.52"/>
        </linearGradient>
        <filter id="shadow"><feGaussianBlur stdDeviation="5"/></filter>
      </defs>
      <rect width="100%" height="100%" fill="url(#shade)"/>
      <rect x="0" y="64" width="1536" height="130" fill="#000" fill-opacity="0.34"/>
      <rect x="0" y="588" width="1536" height="128" fill="#000" fill-opacity="0.36"/>
      <circle cx="768" cy="390" r="160" fill="#000" fill-opacity="0.42"/>
      <circle cx="768" cy="390" r="150" fill="none" stroke="${accent}" stroke-width="8"/>
      <text x="768" y="159" text-anchor="middle" fill="#000" fill-opacity="0.58" font-size="88" font-weight="800"
            font-family="DejaVu Sans, Arial, sans-serif" filter="url(#shadow)">${title}</text>
      <text x="768" y="151" text-anchor="middle" fill="${accent}" font-size="88" font-weight="800"
            font-family="DejaVu Sans, Arial, sans-serif">${title}</text>
      <text x="768" y="682" text-anchor="middle" fill="#000" fill-opacity="0.62" font-size="${nameSize}" font-weight="800"
            font-family="DejaVu Sans, Arial, sans-serif" filter="url(#shadow)">${safeName}</text>
      <text x="768" y="674" text-anchor="middle" fill="${accent}" font-size="${nameSize}" font-weight="800"
            font-family="DejaVu Sans, Arial, sans-serif">${safeName}</text>
    </svg>`);

  const bg = await sharp(background)
    .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'centre' })
    .modulate({ brightness: 0.72, saturation: 1.12 })
    .png()
    .toBuffer();

  const buffer = await sharp(bg)
    .composite([
      { input: overlay, left: 0, top: 0 },
      { input: avatar, left: Math.round((WIDTH - AVATAR) / 2), top: Math.round(390 - AVATAR / 2) },
    ])
    .jpeg({ quality: 88, chromaSubsampling: '4:4:4' })
    .toBuffer();

  return { buffer, style };
}

async function sendGroupEventCard(sock, groupId, options = {}) {
  const {
    participantJid,
    participant,
    groupMetadata,
    type = 'welcome',
    caption = '',
  } = options;

  const memberName = await resolveMemberName(sock, participantJid, participant, groupMetadata);
  let profilePicUrl = null;
  try {
    profilePicUrl = await Promise.race([
      sock.profilePictureUrl(participantJid, 'image'),
      new Promise(resolve => setTimeout(() => resolve(null), 5000)),
    ]);
  } catch (_) {}

  const { buffer, style } = await buildGroupEventCard({ profilePicUrl, memberName, type });
  const footer = styleManager.getPhrases(style)?.footer?.() || '';
  const text = [caption, footer].filter(Boolean).join('\n\n');

  try {
    const menu = require('../commands/general_tools/menu');
    if (typeof menu.sendStyledMenuMessage === 'function') {
      await menu.sendStyledMenuMessage(sock, groupId, {
        text,
        style,
        imageBuffer: buffer,
        quoted: null,
        mentions: [participantJid],
        withImage: true,
      });
      return { memberName, style };
    }
  } catch (err) {
    console.warn('[welcomeCard] envoi interactif indisponible:', err.message);
  }

  const channelUrl = config.social?.whatsappChannel || 'https://whatsapp.com/channel/0029VbCKhnq7j6gEhuUKMP1V';
  await sock.sendMessage(groupId, {
    image: buffer,
    caption: `${text}\n\n📢 ${channelUrl}`,
    mentions: [participantJid],
    contextInfo: {
      forwardingScore: 1,
      isForwarded: true,
      forwardedNewsletterMessageInfo: {
        newsletterJid: config.newsletterJid || '120363411005383995@newsletter',
        newsletterName: config.botName || '𝐓𝐇𝐄 𝐁𝐈𝐆 𝐃𝐈𝐏𝐏𝐄𝐑',
        serverMessageId: -1,
      },
    },
  });
  return { memberName, style };
}

module.exports = {
  buildGroupEventCard,
  sendGroupEventCard,
  resolveMemberName,
};
