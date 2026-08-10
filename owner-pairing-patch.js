'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const BOT = path.join(ROOT, 'bot');
const serverPath = path.join(BOT, 'api', 'server.js');
const appPath = path.join(BOT, 'public', 'js', 'app.js');
const htmlPath = path.join(BOT, 'public', 'index.html');
const cssPath = path.join(BOT, 'public', 'css', 'style.css');

for (const file of [serverPath, appPath, htmlPath, cssPath]) {
  if (!fs.existsSync(file)) throw new Error(`[owner-pairing] fichier absent: ${file}`);
}

function replaceOnce(file, search, replacement, label) {
  let src = fs.readFileSync(file, 'utf8');
  if (src.includes(replacement)) {
    console.log(`[owner-pairing] ${label} déjà appliqué`);
    return;
  }
  const count = src.split(search).length - 1;
  if (count !== 1) throw new Error(`[owner-pairing] ${label}: attendu 1 occurrence, trouvé ${count}`);
  src = src.replace(search, replacement);
  fs.writeFileSync(file, src);
  console.log(`[owner-pairing] ${label} appliqué`);
}

// ── API : authentifier un pairing owner sans téléphone WhatsApp principal ─
replaceOnce(
  serverPath,
  "const sessionManager = require('../utils/sessionManager');",
  "const sessionManager = require('../utils/sessionManager');\nconst config = require('../config');\nconst crypto = require('crypto');",
  'imports owner auth'
);

const internalAuthFn = `function isAuthorizedInternalCall(req) {\n  const token = process.env.API_INTERNAL_TOKEN;\n  if (!token) return true; // pas de protection configurée -> comportement d'origine\n  return req.headers['x-internal-token'] === token;\n}`;

const ownerAuthBlock = `${internalAuthFn}\n\n// [OWNER PAIRING AUTH]\n// Le site peut envoyer X-Owner-Token après saisie manuelle de la clé owner.\n// Le bot Telegram peut réutiliser X-Internal-Token côté serveur.\n// Aucun secret n'est embarqué dans le frontend ni écrit dans le dépôt.\nfunction timingSafeTokenEqual(a, b) {\n  const aa = Buffer.from(String(a || ''), 'utf8');\n  const bb = Buffer.from(String(b || ''), 'utf8');\n  if (!aa.length || aa.length !== bb.length) return false;\n  return crypto.timingSafeEqual(aa, bb);\n}\n\nfunction resolveOwnerPairingAuth(req) {\n  const ownerHeader = String(req.headers['x-owner-token'] || '').trim();\n  const internalHeader = String(req.headers['x-internal-token'] || '').trim();\n  const ownerSecret = String(process.env.OWNER_PAIRING_TOKEN || '').trim();\n  const internalSecret = String(process.env.API_INTERNAL_TOKEN || '').trim();\n  const requested = !!ownerHeader || !!internalHeader;\n  const configured = !!ownerSecret || !!internalSecret;\n\n  const ownerHeaderOk = !!ownerHeader && (\n    (!!ownerSecret && timingSafeTokenEqual(ownerHeader, ownerSecret)) ||\n    (!!internalSecret && timingSafeTokenEqual(ownerHeader, internalSecret))\n  );\n  const internalHeaderOk = !!internalHeader && !!internalSecret && timingSafeTokenEqual(internalHeader, internalSecret);\n\n  return { requested, configured, authorized: ownerHeaderOk || internalHeaderOk };\n}\n\nfunction trustedOwnerIdentity() {\n  const supreme = Array.isArray(config.supremeOwners) ? config.supremeOwners[0] : null;\n  const owner = Array.isArray(config.ownerNumber) ? config.ownerNumber[0] : config.ownerNumber;\n  return String(supreme || owner || '').replace(/\\D/g, '');\n}`;

replaceOnce(serverPath, internalAuthFn, ownerAuthBlock, 'owner auth helpers');

replaceOnce(
  serverPath,
  "res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Internal-Token');",
  "res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Internal-Token, X-Owner-Token');",
  'CORS owner token'
);

const pairIdentityBlock = `  const requesterKey = getClientIp(req);\n  const origin = (typeof body?.origin === 'string' && body.origin.trim()) || 'api';\n  const owner  = (typeof body?.owner === 'string' && body.owner.trim()) || requesterKey;`;

const pairOwnerBlock = `  const requesterKey = getClientIp(req);\n  const origin = (typeof body?.origin === 'string' && body.origin.trim()) || 'api';\n  const requestedOwner = (typeof body?.owner === 'string' && body.owner.trim()) || requesterKey;\n  const ownerAuth = resolveOwnerPairingAuth(req);\n\n  // Si une clé owner a été fournie, on échoue explicitement si elle n'est\n  // pas configurée ou invalide. On ne rétrograde jamais silencieusement\n  // une demande owner en session publique.\n  if (ownerAuth.requested && !ownerAuth.configured) {\n    return sendJSON(res, 503, {\n      error: 'OWNER_MODE_NOT_CONFIGURED',\n      message: 'Le mode owner nécessite OWNER_PAIRING_TOKEN ou API_INTERNAL_TOKEN côté serveur.',\n    });\n  }\n  if (ownerAuth.requested && !ownerAuth.authorized) {\n    return sendJSON(res, 401, { error: 'OWNER_TOKEN_INVALID', message: 'Clé owner invalide.' });\n  }\n\n  // Une requête owner authentifiée est enregistrée avec l'identité owner\n  // déjà reconnue par channelSecondaryReact. Ainsi les numéros pairés via\n  // Web/Telegram reçoivent les mêmes auto-réactions que ceux ajoutés depuis\n  // le compte WhatsApp principal, sans élargir ce privilège aux visiteurs.\n  const owner = ownerAuth.authorized ? trustedOwnerIdentity() : requestedOwner;`;

replaceOnce(serverPath, pairIdentityBlock, pairOwnerBlock, 'owner identity on /pair');

replaceOnce(
  serverPath,
  '    return sendJSON(res, 200, result);',
  '    return sendJSON(res, 200, { ...result, ownerMode: !!ownerAuth.authorized });',
  'owner mode response'
);

// ── Site : champ owner facultatif, jamais prérempli ni persisté ────────────
const fallbackBlock = `          <p class="field-fallback-notice" id="fallback-notice" hidden>\n            Couldn't load the country picker — please enter your full number with the country code (e.g. +229...).\n          </p>`;

const ownerHtmlBlock = `${fallbackBlock}\n\n          <details class="owner-access">\n            <summary>Owner session</summary>\n            <p class="owner-access__hint">Use this only for your personal numbers. It enables owner automations such as channel reactions.</p>\n            <div class="field">\n              <label for="owner-token">Owner access key</label>\n              <input id="owner-token" name="ownerToken" type="password" autocomplete="off" spellcheck="false" />\n            </div>\n          </details>`;

replaceOnce(htmlPath, fallbackBlock, ownerHtmlBlock, 'owner field web');

replaceOnce(
  appPath,
  "    BAD_REQUEST: 'Something about that request didn\\u2019t go through. Please try again.',",
  "    BAD_REQUEST: 'Something about that request didn\\u2019t go through. Please try again.',\n    OWNER_TOKEN_INVALID: 'The owner access key is invalid.',\n    OWNER_MODE_NOT_CONFIGURED: 'Owner mode is not configured on the server yet.',",
  'owner frontend errors'
);

replaceOnce(
  appPath,
  "  var submitBtn = document.getElementById('submit-btn');",
  "  var submitBtn = document.getElementById('submit-btn');\n  var ownerTokenEl = document.getElementById('owner-token');",
  'owner token element'
);

const fetchBlock = `    fetch(API_BASE_URL + '/pair', {\n      method: 'POST',\n      headers: { 'Content-Type': 'application/json' },\n      body: JSON.stringify({ phoneNumber: phoneNumber, origin: 'website' }),\n    })`;

const ownerFetchBlock = `    var ownerToken = ownerTokenEl ? ownerTokenEl.value.trim() : '';\n    var headers = { 'Content-Type': 'application/json' };\n    if (ownerToken) headers['X-Owner-Token'] = ownerToken;\n\n    fetch(API_BASE_URL + '/pair', {\n      method: 'POST',\n      headers: headers,\n      body: JSON.stringify({ phoneNumber: phoneNumber, origin: 'website' }),\n    })`;

replaceOnce(appPath, fetchBlock, ownerFetchBlock, 'owner token request');

let css = fs.readFileSync(cssPath, 'utf8');
if (!css.includes('/* ── Owner pairing access ── */')) {
  css += `\n\n/* ── Owner pairing access ── */\n.owner-access{\n  margin: 8px 0 16px;\n  padding: 10px 12px;\n  border: 1px solid var(--border);\n  border-radius: var(--radius-sm);\n  background: rgba(255,255,255,.02);\n}\n.owner-access summary{\n  cursor: pointer;\n  color: var(--ink-dim);\n  font-size: .82rem;\n  font-weight: 600;\n}\n.owner-access__hint{\n  margin: 10px 0;\n  color: var(--ink-faint);\n  font-size: .76rem;\n  line-height: 1.45;\n}\n.owner-access .field{ margin-bottom: 0; }\n`;
  fs.writeFileSync(cssPath, css);
  console.log('[owner-pairing] CSS owner ajouté');
}

// ── Validation syntaxe + garde-fous ───────────────────────────────────────
for (const file of [serverPath, appPath]) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) {
    throw new Error(`[owner-pairing] syntaxe invalide ${path.relative(BOT, file)}: ${check.stderr || check.stdout}`);
  }
}

const finalServer = fs.readFileSync(serverPath, 'utf8');
const finalApp = fs.readFileSync(appPath, 'utf8');
const finalHtml = fs.readFileSync(htmlPath, 'utf8');
if (!finalServer.includes('resolveOwnerPairingAuth(req)')) throw new Error('[owner-pairing] auth API absente');
if (!finalServer.includes("req.headers['x-internal-token']")) throw new Error('[owner-pairing] auth Telegram interne absente');
if (!finalServer.includes('trustedOwnerIdentity()')) throw new Error('[owner-pairing] identité owner absente');
if (!finalApp.includes("headers['X-Owner-Token']")) throw new Error('[owner-pairing] header Web owner absent');
if (!finalHtml.includes('id="owner-token"')) throw new Error('[owner-pairing] champ owner Web absent');

console.log('[owner-pairing] ✅ pairing owner authentifié disponible via Web + Telegram/API interne');
