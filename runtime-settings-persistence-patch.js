'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const BOT = path.join(ROOT, 'bot');
if (!fs.existsSync(BOT)) throw new Error('[runtime-settings] bot/ absent');

function p(rel) { return path.join(BOT, rel); }
function read(rel) { return fs.readFileSync(p(rel), 'utf8'); }
function write(rel, src) { fs.writeFileSync(p(rel), src, 'utf8'); }

function replaceOnce(rel, search, replacement, marker, label) {
  let src = read(rel);
  if (marker && src.includes(marker)) {
    console.log(`[runtime-settings] ${label} déjà appliqué`);
    return;
  }
  const count = src.split(search).length - 1;
  if (count !== 1) throw new Error(`[runtime-settings] ${label}: attendu 1 occurrence, trouvé ${count}`);
  src = src.replace(search, replacement);
  write(rel, src);
  console.log(`[runtime-settings] ${label} appliqué`);
}

const durablePreferences = `'use strict';
const fs = require('fs');
const path = require('path');
const sessionContext = require('./sessionContext');

const COLLECTION = 'bot_session_preferences';
const memory = new Map();
const pending = new Map();
let hydratePromise = null;

function safeSid(sid = sessionContext.getCurrentSessionId()) {
  return String(sid || sessionContext.DEFAULT_SESSION_ID).replace(/[^a-zA-Z0-9_.-]/g, '_');
}
function dirFor(sid) {
  const dir = path.join(process.cwd(), 'database', 'sessions', safeSid(sid));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function fileFor(sid) { return path.join(dirFor(sid), 'preferences.json'); }
function clone(value) { return JSON.parse(JSON.stringify(value ?? {})); }

function restoreBinaryAssets(data, sid) {
  const restored = data && typeof data === 'object' ? data : {};
  if (typeof restored.menuImageData === 'string' && restored.menuImageData.length > 64) {
    try {
      const file = path.join(dirFor(sid), 'menu_image.jpg');
      fs.writeFileSync(file, Buffer.from(restored.menuImageData, 'base64'));
      restored.menuImagePath = file;
    } catch (err) {
      console.warn('[runtime-settings] restauration image menu échouée:', err.message);
    }
  }
  return restored;
}

function load(sid) {
  const key = safeSid(sid);
  if (memory.has(key)) return memory.get(key);
  let data = {};
  try {
    const file = fileFor(key);
    if (fs.existsSync(file)) data = JSON.parse(fs.readFileSync(file, 'utf8')) || {};
  } catch (_) { data = {}; }
  data = restoreBinaryAssets(data, key);
  memory.set(key, data);
  return data;
}

function writeLocal(data, sid) {
  const key = safeSid(sid);
  const clean = restoreBinaryAssets(data, key);
  const file = fileFor(key);
  const tmp = file + '.tmp-' + process.pid + '-' + Date.now();
  fs.writeFileSync(tmp, JSON.stringify(clean, null, 2), 'utf8');
  fs.renameSync(tmp, file);
  memory.set(key, clean);
  return true;
}

async function mongoDb() {
  if (!process.env.MONGODB_URI) return null;
  try { return await require('./mongoClient').getDb(); }
  catch (err) {
    console.warn('[runtime-settings] Mongo indisponible:', err.message);
    return null;
  }
}

function queueMongoSave(sid, data) {
  if (!process.env.MONGODB_URI) return Promise.resolve(false);
  const key = safeSid(sid);
  const previous = pending.get(key) || Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(async () => {
      const db = await mongoDb();
      if (!db) return false;
      await db.collection(COLLECTION).updateOne(
        { _id: key },
        { $set: { data: clone(data), updatedAt: new Date() } },
        { upsert: true }
      );
      return true;
    })
    .catch(err => {
      console.warn('[runtime-settings] sauvegarde Mongo échouée:', err.message);
      return false;
    })
    .finally(() => {
      if (pending.get(key) === next) pending.delete(key);
    });
  pending.set(key, next);
  return next;
}

function save(data, sid) {
  const key = safeSid(sid);
  const clean = data && typeof data === 'object' ? data : {};
  writeLocal(clean, key);
  queueMongoSave(key, clean);
  return true;
}

function get(key, fallback, sid) {
  const data = load(sid);
  return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : fallback;
}
function set(key, value, sid) {
  const data = { ...load(sid), [key]: value };
  save(data, sid);
  return value;
}
function update(values, sid) {
  const data = { ...load(sid), ...(values || {}) };
  save(data, sid);
  return data;
}
function sessionFile(name, sid) { return path.join(dirFor(sid), String(name).replace(/[\\/]/g, '_')); }

async function migrateLocalPreferencesToMongo(db) {
  const root = path.join(process.cwd(), 'database', 'sessions');
  if (!fs.existsSync(root)) return 0;
  let migrated = 0;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const sid = safeSid(entry.name);
    const file = fileFor(sid);
    if (!fs.existsSync(file)) continue;
    let local;
    try { local = JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch (_) { continue; }
    const existing = await db.collection(COLLECTION).findOne({ _id: sid }, { projection: { _id: 1 } });
    if (existing) continue;
    await db.collection(COLLECTION).updateOne(
      { _id: sid },
      { $set: { data: clone(local), updatedAt: new Date(), migratedFromLocal: true } },
      { upsert: true }
    );
    migrated++;
  }
  return migrated;
}

async function hydrateAllFromMongo() {
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    const db = await mongoDb();
    if (!db) return false;
    const migrated = await migrateLocalPreferencesToMongo(db);
    const docs = await db.collection(COLLECTION).find({}).toArray();
    for (const doc of docs) {
      if (!doc?._id || !doc.data || typeof doc.data !== 'object') continue;
      writeLocal(clone(doc.data), doc._id);
    }
    console.log(`[runtime-settings] ✅ ${docs.length} préférence(s) restaurée(s) depuis MongoDB${migrated ? ` • ${migrated} migration(s) locale(s)` : ''}`);
    return true;
  })().catch(err => {
    console.warn('[runtime-settings] restauration Mongo échouée:', err.message);
    return false;
  });
  return hydratePromise;
}

async function flushMongoWrites() {
  await Promise.allSettled(Array.from(pending.values()));
}

process.on('beforeExit', () => { flushMongoWrites().catch(() => {}); });

module.exports = {
  safeSid, dirFor, fileFor, load, save, get, set, update, sessionFile,
  hydrateAllFromMongo, flushMongoWrites,
};
`;

write('utils/sessionPreferences.js', durablePreferences);
console.log('[runtime-settings] sessionPreferences Mongo durable installé');

replaceOnce(
  'database.js',
  "const { getCurrentSessionId, DEFAULT_SESSION_ID } = require('./utils/sessionContext');",
  "const { getCurrentSessionId, DEFAULT_SESSION_ID } = require('./utils/sessionContext');\nconst sessionPreferences = require('./utils/sessionPreferences'); // [RUNTIME SETTINGS MONGO]",
  '[RUNTIME SETTINGS MONGO]',
  'database importe les préférences persistantes'
);

replaceOnce(
  'database.js',
  `const getGroupSettings = (groupId) => {\n  const groups = readDB('groups');\n  if (!groups[groupId]) {\n    groups[groupId] = { ...(config.defaultGroupSettings || {}) };\n    writeDB('groups', groups);\n  }\n  return groups[groupId];\n};\n\nconst updateGroupSettings = (groupId, settings) => {\n  const groups = readDB('groups');\n  groups[groupId] = { ...(groups[groupId] || {}), ...settings };\n  return writeDB('groups', groups);\n};`,
  `// [RUNTIME GROUP SETTINGS MONGO]\n// Les réglages de groupe vivent dans preferences.json, lui-même répliqué dans\n// MongoDB. groups.json reste lisible pour compatibilité/migration mais n'est\n// plus la source durable sur le disque éphémère de Render.\nfunction persistentGroupsStore() {\n  let groups = sessionPreferences.get('groupSettings', null);\n  if (!groups || typeof groups !== 'object' || Array.isArray(groups)) {\n    const legacy = readDB('groups');\n    groups = legacy && typeof legacy === 'object' && !Array.isArray(legacy) ? legacy : {};\n    sessionPreferences.set('groupSettings', groups);\n  }\n  return groups;\n}\n\nconst getGroupSettings = (groupId) => {\n  const groups = persistentGroupsStore();\n  if (!groups[groupId]) {\n    groups[groupId] = { ...(config.defaultGroupSettings || {}) };\n    sessionPreferences.set('groupSettings', groups);\n  }\n  return groups[groupId];\n};\n\nconst updateGroupSettings = (groupId, settings) => {\n  const groups = persistentGroupsStore();\n  groups[groupId] = { ...(groups[groupId] || {}), ...settings };\n  sessionPreferences.set('groupSettings', groups);\n  return true;\n};`,
  '[RUNTIME GROUP SETTINGS MONGO]',
  'réglages de groupe persistants Mongo'
);

replaceOnce(
  'database.js',
  `const getGhostgMode = () => {\n  const state = readDB('botState');\n  if (state.ghostgMode === undefined) {\n    state.ghostgMode = (config.ghostgMode || 'on');\n  }\n  return state.ghostgMode;\n};\n\nconst setGhostgMode = (value) => {\n  const state = readDB('botState');\n  state.ghostgMode = value;\n  return writeDB('botState', state);\n};`,
  `const getGhostgMode = () => sessionPreferences.get('ghostgMode', config.ghostgMode || 'on'); // [RUNTIME GHOSTG MONGO]\n\nconst setGhostgMode = (value) => {\n  sessionPreferences.set('ghostgMode', value);\n  return true;\n};`,
  '[RUNTIME GHOSTG MONGO]',
  'ghostg persistant Mongo'
);

// L'image du menu était auparavant sauvegardée uniquement dans un fichier
// local Render. Conserver aussi ses octets en base64 dans les préférences
// Mongo permet de recréer le fichier après n'importe quel restart/redeploy.
replaceOnce(
  'commands/bot_sovereignty/setmenuimage.js',
  `      const fallbackPath = sessionPreferences.sessionFile('menu_image.jpg');\n      fs.writeFileSync(fallbackPath, finalBuffer);\n      sessionPreferences.set('menuImagePath', fallbackPath);`,
  `      const fallbackPath = sessionPreferences.sessionFile('menu_image.jpg');\n      fs.writeFileSync(fallbackPath, finalBuffer);\n      sessionPreferences.update({\n        menuImagePath: fallbackPath,\n        menuImageData: finalBuffer.toString('base64'), // [RUNTIME MENU IMAGE MONGO]\n      });`,
  '[RUNTIME MENU IMAGE MONGO]',
  'image menu persistante Mongo'
);

replaceOnce(
  'index.js',
  "    await require('./utils/prefixManager').initializePrefix();",
  "    await require('./utils/sessionPreferences').hydrateAllFromMongo(); // [RUNTIME SETTINGS HYDRATE]\n    await require('./utils/prefixManager').initializePrefix();",
  '[RUNTIME SETTINGS HYDRATE]',
  'restauration réglages avant chargement du handler'
);

for (const rel of [
  'utils/sessionPreferences.js', 'database.js', 'index.js',
  'commands/bot_sovereignty/setmenuimage.js',
]) {
  const result = spawnSync(process.execPath, ['--check', p(rel)], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`[runtime-settings] syntaxe ${rel}: ${result.stderr || result.stdout}`);
}

console.log('[runtime-settings] ✅ réglages runtime/groupes + identité/style/menu image persistants Mongo');
