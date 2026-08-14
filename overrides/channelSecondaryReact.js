'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../config');
const { chooseReactionEmoji, extractPublicationText } = require('./channelAutoReact');

const MAX_SEEN = 400;
const MONGO_COLLECTION = 'bot_runtime_config';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

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

function readLocalState(sessionId) {
  try {
    const parsed = JSON.parse(fs.readFileSync(storeFileFor(sessionId), 'utf8'));
    return {
      ids: Array.isArray(parsed?.recentServerIds) ? parsed.recentServerIds.map(String) : [],
      reactNext: typeof parsed?.reactNext === 'boolean' ? parsed.reactNext : true,
    };
  } catch (_) {
    return { ids: [], reactNext: true };
  }
}

function writeLocalState(sessionId, ids, reactNext) {
  try {
    const file = storeFileFor(sessionId);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify({ recentServerIds: ids.slice(-MAX_SEEN), reactNext, updatedAt: new Date().toISOString() }, null, 2)
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

async function loadState(sessionId) {
  const local = readLocalState(sessionId);
  const state = { seen: new Set(local.ids), reactNext: local.reactNext };
  const db = await getMongoDb();
  if (db) {
    try {
      const doc = await db.collection(MONGO_COLLECTION).findOne({ _id: mongoDocId(sessionId) });
      for (const id of doc?.recentServerIds || []) state.seen.add(String(id));
      if (typeof doc?.reactNext === 'boolean') state.reactNext = doc.reactNext;
    } catch (_) {}
  }
  return state;
}

async function persistState(sessionId, state) {
  const ids = Array.from(state.seen).slice(-MAX_SEEN);
  writeLocalState(sessionId, ids, state.reactNext);

  const db = await getMongoDb();
  if (db) {
    try {
      await db.collection(MONGO_COLLECTION).updateOne(
        { _id: mongoDocId(sessionId) },
        { $set: { recentServerIds: ids, reactNext: state.reactNext, updatedAt: new Date() } },
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
  if (typeof sock.subscribeNewsletterUpdates !== 'function') {
    console.warn(`[SecondaryChannelReact] ${sessionId}: subscribeNewsletterUpdates non supporté`);
    return false;
  }
  try {
    await sock.subscribeNewsletterUpdates(jid);
    console.log(`[SecondaryChannelReact] 📡 ${sessionId}: live updates actifs`);
    return true;
  } catch (err) {
    console.warn(`[SecondaryChannelReact] ${sessionId}: live updates non confirmés: ${String(err?.message || err).slice(0, 140)}`);
    return false;
  }
}

function scheduleLiveSubscriptions(sock, jid, sessionId) {
  if (sock._dipperSecondaryChannelReactLiveTimers) return;
  const delays = [2000, 60_000, 5 * 60_000, 60 * 60_000 + 5000];
  sock._dipperSecondaryChannelReactLiveTimers = delays.map(delay => {
    const timer = setTimeout(() => subscribeToLiveUpdates(sock, jid, sessionId).catch(() => {}), delay);
    if (timer.unref) timer.unref();
    return timer;
  });
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

  const jid = config.newsletterJid;
  if (!jid || !String(jid).endsWith('@newsletter')) {
    console.warn(`[SecondaryChannelReact] ${sessionId}: newsletterJid invalide/absent`);
    return { enabled: false, reason: 'invalid_jid' };
  }
  if (typeof sock.newsletterReactMessage !== 'function') {
    console.warn(`[SecondaryChannelReact] ${sessionId}: newsletterReactMessage non supporté`);
    return { enabled: false, reason: 'unsupported' };
  }

  // UNIVERSAL CHANNEL REACT: aucune restriction owner/origin.
  // Toute session secondaire réellement ouverte reçoit le listener,
  // quelle que soit son origine (WhatsApp, site Web, Telegram, dashboard,
  // restauration Mongo ou reconnexion automatique).
  try {
    await require('./channelAutoFollow').ensureChannelFollow(sock, sessionId);
  } catch (_) {}

  const statePromise = loadState(sessionId);
  sock._dipperSecondaryChannelReactQueue = sock._dipperSecondaryChannelReactQueue || Promise.resolve();
  scheduleLiveSubscriptions(sock, jid, sessionId);

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages || []) {
      if (msg?.key?.remoteJid !== jid) continue;
      if (!msg.message || !isPublicationMessage(msg)) continue;

      const serverId = getServerId(msg);
      if (!serverId) continue;

      sock._dipperSecondaryChannelReactQueue = sock._dipperSecondaryChannelReactQueue
        .then(async () => {
          const state = await statePromise;
          if (state.seen.has(serverId)) return;

          const shouldReact = state.reactNext;
          state.reactNext = !state.reactNext;
          state.seen.add(serverId);
          while (state.seen.size > MAX_SEEN) state.seen.delete(state.seen.values().next().value);
          await persistState(sessionId, state);

          if (!shouldReact) {
            console.log(`[SecondaryChannelReact] ⏭️ ${sessionId}: publication ${serverId} ignorée — alternance 1 sur 2`);
            return;
          }

          const text = extractPublicationText(msg);
          const baseEmoji = chooseReactionEmoji(text, msg.message);
          const emoji = chooseSecondaryEmoji(baseEmoji, sessionId, serverId);
          const naturalDelay = 2500 + (hash(`${serverId}:${sessionId}:delay`) % 4500);
          await wait(naturalDelay);
          await reactWithRetry(sock, jid, serverId, emoji, sessionId);
          console.log(`[SecondaryChannelReact] ✅ ${sessionId}: publication ${serverId} → ${emoji}`);
        })
        .catch(err => {
          console.warn(`[SecondaryChannelReact] ⚠️ ${sessionId}: réaction ${serverId} échouée: ${String(err?.message || err).slice(0, 160)}`);
        });
    }
  });

  console.log(`[SecondaryChannelReact] ✅ ${sessionId}: auto-réactions universelles 1 publication sur 2 activées → ${jid} | origin=${meta.origin || 'unknown'}`);
  return { enabled: true, jid, origin: meta.origin || 'unknown' };
}

module.exports = {
  installSecondaryChannelAutoReact,
  chooseSecondaryEmoji,
};
