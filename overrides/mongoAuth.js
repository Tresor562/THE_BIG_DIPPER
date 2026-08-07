'use strict';

const fs = require('fs');
const path = require('path');
const { proto, initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const fixFileName = (file) => String(file).replace(/\//g, '__').replace(/:/g, '-');

function getCollection(db, sessionId) {
  return db.collection(`auth_${sessionId}`);
}

async function retryMongo(fn, label, attempts = 3) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try { return await fn(); }
    catch (err) {
      lastErr = err;
      if (i < attempts) await sleep(250 * i);
    }
  }
  throw new Error(`[MongoAuth] ${label}: ${lastErr?.message || lastErr}`);
}

async function removeLegacyTtlIndex(collection) {
  try {
    const indexes = await collection.indexes();
    for (const idx of indexes) {
      if (idx?.expireAfterSeconds != null) {
        await collection.dropIndex(idx.name);
        console.log(`[MongoAuth] TTL historique supprimé sur ${collection.collectionName}: ${idx.name}`);
      }
    }
  } catch (err) {
    // Namespace absent avant la première écriture = normal.
    if (!/ns does not exist|namespace.*not found/i.test(String(err?.message || ''))) {
      console.warn(`[MongoAuth] Vérification TTL ${collection.collectionName}: ${err.message}`);
    }
  }
}

async function hasMongoAuthState(db, sessionId) {
  const collection = getCollection(db, sessionId);
  try {
    const doc = await retryMongo(
      () => collection.findOne({ _id: 'creds' }, { projection: { _id: 1, value: 1 } }),
      `hasMongoAuthState(${sessionId})`
    );
    return !!doc?.value;
  } catch (err) {
    console.error(err.message);
    return false;
  }
}

/**
 * Importe une auth Baileys useMultiFileAuthState existante vers MongoDB.
 * Ne fait rien si Mongo possède déjà des creds pour cette session.
 */
async function importLocalAuthDirectoryToMongo(db, sessionId, localDir) {
  if (await hasMongoAuthState(db, sessionId)) return false;
  const credsPath = path.join(localDir, 'creds.json');
  if (!fs.existsSync(credsPath)) return false;

  const collection = getCollection(db, sessionId);
  const files = fs.readdirSync(localDir).filter(name => name.endsWith('.json'));
  if (!files.includes('creds.json')) return false;

  const ops = [];
  for (const file of files) {
    const raw = fs.readFileSync(path.join(localDir, file), 'utf8');
    // Valider avant stockage : évite de migrer un JSON tronqué.
    JSON.parse(raw, BufferJSON.reviver);
    const id = file === 'creds.json' ? 'creds' : file.slice(0, -5);
    ops.push({
      updateOne: {
        filter: { _id: id },
        update: { $set: { value: raw, updatedAt: new Date(), migratedFromFile: true } },
        upsert: true,
      }
    });
  }

  if (ops.length) {
    await retryMongo(() => collection.bulkWrite(ops, { ordered: false }), `importLocal(${sessionId})`);
    console.log(`[MongoAuth] ✅ ${sessionId}: ${ops.length} fichier(s) d'auth migré(s) vers MongoDB`);
  }
  await removeLegacyTtlIndex(collection);
  return true;
}

async function useMongoAuthState(db, sessionId) {
  const collection = getCollection(db, sessionId);
  await removeLegacyTtlIndex(collection);

  const readData = async (id) => {
    // Les anciens fichiers Baileys remplacent / par __ et : par -.
    // Lors d'une migration locale, on conserve ces noms ; le fallback permet
    // donc de relire aussi bien les clés natives Mongo que les clés migrées.
    const ids = [String(id), fixFileName(id)];
    let doc = null;
    for (const candidate of [...new Set(ids)]) {
      doc = await retryMongo(() => collection.findOne({ _id: candidate }), `read(${sessionId}/${candidate})`);
      if (doc?.value) break;
    }
    if (!doc?.value) return null;
    return JSON.parse(doc.value, BufferJSON.reviver);
  };

  const writeData = async (id, value) => {
    const serialized = JSON.stringify(value, BufferJSON.replacer);
    await retryMongo(
      () => collection.updateOne(
        { _id: String(id) },
        { $set: { value: serialized, updatedAt: new Date() } },
        { upsert: true }
      ),
      `write(${sessionId}/${id})`
    );
  };

  const removeData = async (id) => {
    const ids = [...new Set([String(id), fixFileName(id)])];
    await retryMongo(() => collection.deleteMany({ _id: { $in: ids } }), `remove(${sessionId}/${id})`);
  };

  const storedCreds = await readData('creds');
  const creds = storedCreds || initAuthCreds();

  const state = {
    creds,
    keys: {
      get: async (type, ids) => {
        const data = {};
        await Promise.all(ids.map(async (id) => {
          let value = await readData(`${type}-${id}`);
          if (type === 'app-state-sync-key' && value) {
            value = proto.Message.AppStateSyncKeyData.fromObject(value);
          }
          data[id] = value;
        }));
        return data;
      },
      set: async (data) => {
        const tasks = [];
        for (const [category, entries] of Object.entries(data || {})) {
          for (const [id, value] of Object.entries(entries || {})) {
            const docId = `${category}-${id}`;
            tasks.push(value ? writeData(docId, value) : removeData(docId));
          }
        }
        await Promise.all(tasks);
      },
    },
  };

  // EventEmitter n'attend pas les handlers async : on retry ici et on log
  // l'échec final au lieu de produire une rejection non gérée.
  const saveCreds = async () => {
    try { await writeData('creds', state.creds); }
    catch (err) { console.error(`[MongoAuth] saveCreds ${sessionId}:`, err.message); }
  };

  return { state, saveCreds };
}

async function deleteMongoSession(db, sessionId) {
  try { await getCollection(db, sessionId).drop(); }
  catch (err) {
    if (!/ns not found|namespace.*not found/i.test(String(err?.message || ''))) {
      console.error(`[MongoAuth] deleteSession ${sessionId}:`, err.message);
    }
  }
}

async function listMongoSessions(db) {
  try {
    const collections = await db.listCollections().toArray();
    return collections.map(c => c.name).filter(n => n.startsWith('auth_')).map(n => n.slice(5));
  } catch { return []; }
}

module.exports = {
  useMongoAuthState,
  hasMongoAuthState,
  importLocalAuthDirectoryToMongo,
  deleteMongoSession,
  listMongoSessions,
};
