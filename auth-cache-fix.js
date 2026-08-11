'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BOT = path.join(__dirname, 'bot');
if (!fs.existsSync(BOT)) throw new Error('[auth-cache] bot/ absent — sous-module non cloné.');

function replaceOnce(rel, search, replacement, marker, label) {
  const file = path.join(BOT, rel);
  let src = fs.readFileSync(file, 'utf8');
  if (marker && src.includes(marker)) {
    console.log(`[auth-cache] ${label} déjà appliqué`);
    return;
  }
  const count = src.split(search).length - 1;
  if (count !== 1) throw new Error(`[auth-cache] ${label}: attendu 1 occurrence, trouvé ${count}`);
  fs.writeFileSync(file, src.replace(search, replacement));
  console.log(`[auth-cache] ${label} appliqué`);
}

function check(rel) {
  const file = path.join(BOT, rel);
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`[auth-cache] syntaxe invalide ${rel}: ${result.stderr || result.stdout}`);
}

// Baileys recommande de mettre le SignalKeyStore derrière
// makeCacheableSignalKeyStore. C'est particulièrement important ici car
// l'état est désormais persistant dans MongoDB : on évite une requête Mongo
// pour chaque accès cryptographique pendant l'usage normal du bot.
replaceOnce(
  'utils/sessionManager.js',
  `  fetchLatestWaWebVersion,\n  proto,`,
  `  fetchLatestWaWebVersion,\n  makeCacheableSignalKeyStore,\n  proto,`,
  '  makeCacheableSignalKeyStore,',
  'import cache SignalKeyStore'
);

replaceOnce(
  'utils/sessionManager.js',
  '    auth              : state,',
  `    auth              : {\n      creds: state.creds,\n      keys : makeCacheableSignalKeyStore(state.keys, silentLogger),\n    },`,
  'keys : makeCacheableSignalKeyStore(state.keys, silentLogger)',
  'cache des clés Signal'
);

// Les credentials WhatsApp ne doivent pas expirer automatiquement. L'ancien
// mongoAuth créait un index TTL 90 jours sur updatedAt, ce qui pouvait finir
// par supprimer des clés cryptographiques encore nécessaires. On supprime
// cet index TTL s'il existe et on garde un index normal non-expirant.
replaceOnce(
  'utils/mongoAuth.js',
  `  // ── Créer index TTL si possible (nettoyage auto des sessions expirées) ───\n  try {\n    await collection.createIndex(\n      { updatedAt: 1 },\n      { expireAfterSeconds: 60 * 60 * 24 * 90, sparse: true } // 90 jours\n    );\n  } catch {} // index peut déjà exister`,
  `  // ── Index non-expirant : les clés d'auth WhatsApp restent persistantes ──\n  try { await collection.dropIndex('updatedAt_1'); } catch {}\n  try { await collection.createIndex({ updatedAt: 1 }, { sparse: true }); } catch {}`,
  'Index non-expirant : les clés',
  'suppression TTL credentials'
);

// Lecture parallèle des clés demandées par Baileys. L'ancien for/await était
// séquentiel et multipliait la latence Mongo lors des rafales de messages.
replaceOnce(
  'utils/mongoAuth.js',
  `      get: async (type, ids) => {\n        const data = {};\n        for (const id of ids) {\n          let value = await readData(\`${'${type}'}-${'${id}'}\`);\n          // Baileys exige que pre-keys soient des objets { type, id, ... }\n          if (type === 'app-state-sync-key' && value) {\n            value = proto.Message.AppStateSyncKeyData.fromObject(value);\n          }\n          data[id] = value;\n        }\n        return data;\n      },`,
  `      get: async (type, ids) => {\n        const entries = await Promise.all(ids.map(async (id) => {\n          let value = await readData(\`${'${type}'}-${'${id}'}\`);\n          if (type === 'app-state-sync-key' && value) {\n            value = proto.Message.AppStateSyncKeyData.fromObject(value);\n          }\n          return [id, value];\n        }));\n        return Object.fromEntries(entries);\n      },`,
  'const entries = await Promise.all(ids.map',
  'lecture parallèle clés Mongo'
);

check('utils/sessionManager.js');
check('utils/mongoAuth.js');
console.log('[auth-cache] ✅ authentification Mongo persistante + cache Signal validés');
