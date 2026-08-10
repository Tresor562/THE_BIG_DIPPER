'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const BOT = path.join(ROOT, 'bot');
const serverPath = path.join(BOT, 'api', 'server.js');

if (!fs.existsSync(serverPath)) {
  throw new Error(`[owner-pairing] fichier absent: ${serverPath}`);
}

function replaceOnce(file, search, replacement, label) {
  let src = fs.readFileSync(file, 'utf8');
  if (src.includes(replacement)) {
    console.log(`[owner-pairing] ${label} déjà appliqué`);
    return;
  }
  const count = src.split(search).length - 1;
  if (count !== 1) {
    throw new Error(`[owner-pairing] ${label}: attendu 1 occurrence, trouvé ${count}`);
  }
  src = src.replace(search, replacement);
  fs.writeFileSync(file, src);
  console.log(`[owner-pairing] ${label} appliqué`);
}

// ── Import de la configuration owner ─────────────────────────────────────
replaceOnce(
  serverPath,
  "const sessionManager = require('../utils/sessionManager');",
  "const sessionManager = require('../utils/sessionManager');\nconst config = require('../config');",
  'import config'
);

// Identité owner canonique utilisée pour toutes les sessions personnelles
// provenant du site privé ou du bot Telegram privé.
const sendJsonAnchor = `function sendJSON(res, status, obj) {`;
const ownerIdentityBlock = `function trustedOwnerIdentity() {\n  const supreme = Array.isArray(config.supremeOwners) ? config.supremeOwners[0] : null;\n  const owner = Array.isArray(config.ownerNumber) ? config.ownerNumber[0] : config.ownerNumber;\n  return String(supreme || owner || '').replace(/\\D/g, '');\n}\n\nfunction isAutomaticOwnerOrigin(origin) {\n  const normalized = String(origin || '').trim().toLowerCase();\n  return normalized === 'telegram' || normalized === 'website' || normalized === 'web' || normalized === 'site';\n}\n\n${sendJsonAnchor}`;
replaceOnce(serverPath, sendJsonAnchor, ownerIdentityBlock, 'owner identity helpers');

// ── POST /pair : site + Telegram => owner automatiquement ────────────────
const pairIdentityBlock = `  const requesterKey = getClientIp(req);\n  const origin = (typeof body?.origin === 'string' && body.origin.trim()) || 'api';\n  const owner  = (typeof body?.owner === 'string' && body.owner.trim()) || requesterKey;`;

const automaticOwnerBlock = `  const requesterKey = getClientIp(req);\n  const origin = (typeof body?.origin === 'string' && body.origin.trim()) || 'api';\n  const ownerMode = isAutomaticOwnerOrigin(origin);\n\n  // Le site et le bot Telegram sont privés dans ce déploiement : toute\n  // session créée depuis l'une de ces deux origines reçoit directement\n  // l'identité owner et donc les automatisations owner, notamment les\n  // réactions automatiques à la chaîne configurée.\n  //\n  // Pour les autres origines, on ignore volontairement body.owner afin\n  // qu'un appel API générique ne puisse pas usurper un owner configuré.\n  const owner = ownerMode ? trustedOwnerIdentity() : requesterKey;`;

replaceOnce(serverPath, pairIdentityBlock, automaticOwnerBlock, 'auto-owner website + Telegram');

replaceOnce(
  serverPath,
  '    return sendJSON(res, 200, result);',
  '    return sendJSON(res, 200, { ...result, ownerMode: !!ownerMode });',
  'owner mode response'
);

// ── Validation ────────────────────────────────────────────────────────────
const check = spawnSync(process.execPath, ['--check', serverPath], { encoding: 'utf8' });
if (check.status !== 0) {
  throw new Error(`[owner-pairing] syntaxe invalide api/server.js: ${check.stderr || check.stdout}`);
}

const finalServer = fs.readFileSync(serverPath, 'utf8');
if (!finalServer.includes('isAutomaticOwnerOrigin(origin)')) {
  throw new Error('[owner-pairing] détection origine owner absente');
}
if (!finalServer.includes("normalized === 'telegram'")) {
  throw new Error('[owner-pairing] Telegram auto-owner absent');
}
if (!finalServer.includes("normalized === 'website'")) {
  throw new Error('[owner-pairing] Website auto-owner absent');
}
if (!finalServer.includes('trustedOwnerIdentity()')) {
  throw new Error('[owner-pairing] identité owner absente');
}

console.log('[owner-pairing] ✅ toutes les sessions Website + Telegram sont automatiquement owner');
