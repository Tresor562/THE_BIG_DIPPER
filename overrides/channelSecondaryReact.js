'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../config');
const { chooseReactionEmoji, extractPublicationText } = require('./channelAutoReact');

const MAX_SEEN = 400;
const MONGO_COLLECTION = 'bot_runtime_config';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function normalizeOwnerPhone(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.split('@')[0].split(':')[0].replace(/\D/g, '');
}

function isAuthorizedOwner(owner) {
  const raw = String(owner || '').trim();
  if (!raw) return false;

  const lower = raw.toLowerCase();
  const allowedLids = (config.supremeOwnerLids || []).map(value => String(value).toLowerCase());
  if (allowedLids.includes(lower)) return true;

  const ownerPhone = normalizeOwnerPhone(raw);
  if (!ownerPhone) return false;
  const allowedPhones = [
    ...(config.supremeOwners || []),
    ...(Array.isArray(config.ownerNumber) ? config.ownerNumber : [config.ownerNumber]),
  ]
    .filter(Boolean)
    .map(normalizeOwnerPhone)
    .filter(Boolean);

  return allowedPhones.includes(ownerPhone);
}

function unwrapMessage(message) {
  let m = message || {};
  if (m.ephemeralMessage?.message) m = m.ephemeralMessage.message;
  if (m.viewOnceMessage?.message) m = m.viewOnceMessage.message;
  if (m.viewOnceMessageV2?.message) m = m.viewOnceMessageV2.message;
  if (m.viewOnceMessageV2Extension?.message) m = m.viewOnceMessageV2Extension.message;
  if (m.documentWithCaptionMessage?.message) m = m.documentWithCaptionMessage.message;
  return m || {};
}

function isPublicationMessage(msg) {
  const m = unwrapMessage(msg?.message);
  if (!m || typeof m !== 'object') return false;
  if (m.protocolMessage || m.reactionMessage || m.senderKeyDistributionMessage) return false;
  return !!(
    m.conversation ||
    m.extendedTextMessage ||
    m.imageMessage ||
    m.videoMessage ||
    m.documentMessage ||
    m.audioMessage ||
    m.pollCreationMessage ||
    m.stickerMessage
  );
}

function safeSessionId(value) {
  return String(value || 'secondary').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 90);
}

function storeFileFor(sessionId) {
  return path.join(process.cwd(), 'database', `secondary_channel_reactions_${safeSessionId(sessionId)}.json`);
}

function mongoDocId(sessionId) {
  return `secondary_channel_reactions:${safeSessionId(sessionId)}`;
}

function readLocalSeen(sessionId) {
  try {
    const parsed = JSON.parse(fs.readFileSync(storeFileFor(sessionId), 'utf8'));
    return Array.isArray(parsed?.recentServerIds) ? parsed.recentServerIds.map(String) : [];
  } catch (_) {
    return [];
  }
}

function writeLocalSeen(sessionId, ids) {
  try {
    const file = storeFileFor(sessionId);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify({ recentServerIds: ids.slice(-MAX_SEEN), updatedAt: new Date().toISOString() }, null, 2)
    );
  } catch (_) {}
}

async function getMongoDb() {
  if (!process.env.MONGODB_URI) return null;
  try {
    return await require('./mongoClient').getDb();
  } catch (_) {
    return null;
  }
}

async function loadSeen(sessionId) {
  const ids = new Set(readLocalSeen(sessionId));
  const db = await getMongoDb();
  if (db) {
    try {
      const doc = await db.collection(MONGO_COLLECTION).findOne({ _id: mongoDocId(sessionId) });
      for (const id of doc?.recentServerIds || []) ids.add(String(id));
    } catch (_) {}
  }
  return ids;
}

async function persistSeen(sessionId, seen) {
  const ids = Array.from(seen).slice(-MAX_SEEN);
  writeLocalSeen(sessionId, ids);

  const db = await getMongoDb();
  if (db) {
    try {
      await db.collection(MONGO_COLLECTION).updateOne(
        { _id: mongoDocId(sessionId) },
        { $set: { recentServerIds: ids, updatedAt: new Date() } },
        { upsert: true }
      );
    } catch (err) {
      console.warn(`[SecondaryChannelReact] ${sessionId}: persistance Mongo échouée: ${err.message}`);
    }
  }
}

function hash(value) {
  let out = 0;
  for (const char of String(value || '')) out = ((out << 5) - out + char.charCodeAt(0)) | 0;
  return Math.abs(out);
}

function chooseSecondaryEmoji(baseEmoji, sessionId, serverId) {
  const alternatives = {
    '🛡️': ['🛡️', '🔥', '👍'],
    '🤖': ['🤖', '🔥', '👍'],
    '💻': ['💻', '🔥', '👍'],
    '💡': ['💡', '👏', '👍'],
    '🚀': ['🚀', '🔥', '👏'],
    '🎉': ['🎉', '❤️', '👏'],
    '❤️': ['❤️', '😍', '👏'],
    '👏': ['👏', '🔥', '❤️'],
    '🔥': ['🔥', '❤️', '👏'],
    '🎧': ['🎧', '❤️', '🔥'],
    '👍': ['👍', '❤️', '🔥'],
  };
  const choices = alternatives[baseEmoji] || [baseEmoji || '👍', '❤️', '🔥'];
  return choices[hash(`${sessionId}:${serverId}`) % choices.length];
}

function getServerId(msg) {
  const value = msg?.key?.server_id ?? msg?.key?.serverId ?? msg?.newsletterServerId;
  return value == null ? '' : String(value);
}

async function subscribeToLiveUpdates(sock, jid, sessionId) {
  if (typeof sock.subscribeNewsletterUpdates !== 'function') return;
  try {
    await sock.subscribeNewsletterUpdates(jid);
  } catch (err) {
    console.warn(`[SecondaryChannelReact] ${sessionId}: live updates non confirmés: ${String(err?.message || err).slice(0, 140)}`);
  }
}

async function reactWithRetry(sock, jid, serverId, emoji, sessionId) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await sock.newsletterReactMessage(jid, serverId, emoji);
      return;
    } catch (err) {
      lastError = err;
      if (attempt < 3) await wait(1800 * attempt);
    }
  }
  throw lastError;
}

async function installSecondaryChannelAutoReact(sock, meta = {}) {
  const sessionId = safeSessionId(meta.sessionId || meta.phoneNumber || 'secondary');
  if (!sock || sock._dipperSecondaryChannelReactInstalled) return { enabled: false, reason: 'already_installed' };
  sock._dipperSecondaryChannelReactInstalled = true;

  if (!isAuthorizedOwner(meta.owner)) {
    console.log(`[SecondaryChannelReact] ${sessionId}: désactivé — session non créée par un owner autorisé`);
    return { enabled: false, reason: 'unauthorized_owner' };
  }

  const jid = config.newsletterJid;
  if (!jid || !String(jid).endsWith('@newsletter')) {
    console.warn(`[SecondaryChannelReact] ${sessionId}: newsletterJid invalide/absent`);
    return { enabled: false, reason: 'invalid_jid' };
  }
  if (typeof sock.newsletterReactMessage !== 'function') {
    console.warn(`[SecondaryChannelReact] ${sessionId}: newsletterReactMessage non supporté`);
    return { enabled: false, reason: 'unsupported' };
  }

  try {
    await require('./channelAutoFollow').ensureChannelFollow(sock, sessionId);
  } catch (_) {}

  const seenPromise = loadSeen(sessionId);
  sock._dipperSecondaryChannelReactQueue = sock._dipperSecondaryChannelReactQueue || Promise.resolve();
  setTimeout(() => subscribeToLiveUpdates(sock, jid, sessionId).catch(() => {}), 2000);

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages || []) {
      if (msg?.key?.remoteJid !== jid) continue;
      if (!msg.message || !isPublicationMessage(msg)) continue;

      const serverId = getServerId(msg);
      if (!serverId) continue;

      sock._dipperSecondaryChannelReactQueue = sock._dipperSecondaryChannelReactQueue
        .then(async () => {
          const seen = await seenPromise;
          if (seen.has(serverId)) return;

          const text = extractPublicationText(msg);
          const baseEmoji = chooseReactionEmoji(text, msg.message);
          const emoji = chooseSecondaryEmoji(baseEmoji, sessionId, serverId);
          const naturalDelay = 2500 + (hash(`${serverId}:${sessionId}:delay`) % 4500);
          await wait(naturalDelay);
          await reactWithRetry(sock, jid, serverId, emoji, sessionId);

          seen.add(serverId);
          while (seen.size > MAX_SEEN) seen.delete(seen.values().next().value);
          await persistSeen(sessionId, seen);
          console.log(`[SecondaryChannelReact] ✅ ${sessionId}: publication ${serverId} → ${emoji}`);
        })
        .catch(err => {
          console.warn(`[SecondaryChannelReact] ⚠️ ${sessionId}: réaction ${serverId} échouée: ${String(err?.message || err).slice(0, 160)}`);
        });
    }
  });

  console.log(`[SecondaryChannelReact] ✅ ${sessionId}: auto-réactions owner activées → ${jid}`);
  return { enabled: true, jid };
}

module.exports = {
  installSecondaryChannelAutoReact,
  isAuthorizedOwner,
  chooseSecondaryEmoji,
};
