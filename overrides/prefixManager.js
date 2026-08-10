'use strict';

const config = require('../config');
const database = require('../database');

const COLLECTION = 'bot_runtime_config';
const DOC_ID = 'global_prefix';

function graphemeCount(value) {
  try {
    if (typeof Intl?.Segmenter === 'function') {
      const seg = new Intl.Segmenter('fr', { granularity: 'grapheme' });
      return Array.from(seg.segment(value)).length;
    }
  } catch (_) {}
  return Array.from(value).length;
}

function validatePrefix(value) {
  const prefix = String(value ?? '').trim();
  if (!prefix) return { ok: false, reason: 'Le préfixe ne peut pas être vide.' };
  if (/\s/u.test(prefix)) return { ok: false, reason: 'Le préfixe ne doit contenir aucun espace.' };
  if (/[\p{L}\p{N}]/u.test(prefix)) {
    return { ok: false, reason: 'Les lettres et les chiffres ne sont pas autorisés dans le préfixe.' };
  }
  // Caractères invisibles dangereux : on autorise ZWJ (U+200D) et VS16 (U+FE0F)
  // car ils sont nécessaires à certains emojis composés.
  if (/[\u0000-\u001F\u007F\u200B\u200C\u200E\u200F\u2060\uFEFF]/u.test(prefix)) {
    return { ok: false, reason: 'Le préfixe contient un caractère invisible ou de contrôle non autorisé.' };
  }
  const count = graphemeCount(prefix);
  if (count > 4) {
    return { ok: false, reason: 'Le préfixe peut contenir au maximum 4 symboles/emojis.' };
  }
  return { ok: true, prefix };
}

async function getMongoDb() {
  if (!process.env.MONGODB_URI) return null;
  try {
    const { getDb } = require('./mongoClient');
    return await getDb();
  } catch (err) {
    console.warn('[Prefix] Mongo indisponible:', err.message);
    return null;
  }
}

function applyRuntimePrefix(prefix) {
  config.prefix = prefix;
  process.env.PREFIX = prefix;

  // menu.js conserve historiquement le préfixe dans une variable locale.
  // Si le module est déjà chargé, on le synchronise sans recharger tout le bot.
  try {
    const menu = require('../commands/general_tools/menu');
    if (typeof menu.setRuntimePrefix === 'function') menu.setRuntimePrefix(prefix);
  } catch (_) {}

  return prefix;
}

async function initializePrefix() {
  let candidate = null;

  try {
    const local = database.getBotPrefix?.();
    const validLocal = validatePrefix(local);
    if (validLocal.ok) candidate = validLocal.prefix;
  } catch (_) {}

  const db = await getMongoDb();
  if (db) {
    try {
      const doc = await db.collection(COLLECTION).findOne({ _id: DOC_ID });
      const validMongo = validatePrefix(doc?.prefix);
      if (validMongo.ok) {
        candidate = validMongo.prefix;
      } else if (candidate) {
        await db.collection(COLLECTION).updateOne(
          { _id: DOC_ID },
          { $set: { prefix: candidate, updatedAt: new Date() } },
          { upsert: true }
        );
      }
    } catch (err) {
      console.warn('[Prefix] Lecture Mongo échouée:', err.message);
    }
  }

  if (!candidate) {
    const fallback = validatePrefix(process.env.PREFIX || config.prefix || '.');
    candidate = fallback.ok ? fallback.prefix : '.';
  }

  try { database.setBotPrefix?.(candidate); } catch (_) {}
  applyRuntimePrefix(candidate);
  console.log(`[Prefix] ✅ Préfixe actif: ${candidate}`);
  return candidate;
}

async function setPrefix(value) {
  const validation = validatePrefix(value);
  if (!validation.ok) return validation;

  const prefix = validation.prefix;
  applyRuntimePrefix(prefix);
  try { database.setBotPrefix?.(prefix); } catch (_) {}

  let mongoPersisted = false;
  const db = await getMongoDb();
  if (db) {
    try {
      await db.collection(COLLECTION).updateOne(
        { _id: DOC_ID },
        { $set: { prefix, updatedAt: new Date() } },
        { upsert: true }
      );
      mongoPersisted = true;
    } catch (err) {
      console.warn('[Prefix] Sauvegarde Mongo échouée:', err.message);
    }
  }

  return { ok: true, prefix, mongoPersisted };
}

function getPrefix() {
  return config.prefix || '.';
}

module.exports = {
  validatePrefix,
  initializePrefix,
  setPrefix,
  getPrefix,
};
