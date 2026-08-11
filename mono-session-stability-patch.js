'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BOT = path.join(__dirname, 'bot');
const indexPath = path.join(BOT, 'index.js');
if (!fs.existsSync(indexPath)) throw new Error('[mono-session] bot/index.js absent');

function patch(search, replacement, marker, label) {
  let src = fs.readFileSync(indexPath, 'utf8');
  if (marker && src.includes(marker)) {
    console.log(`[mono-session] ${label} déjà appliqué`);
    return;
  }
  const count = src.split(search).length - 1;
  if (count !== 1) throw new Error(`[mono-session] ${label}: attendu 1 occurrence, trouvé ${count}`);
  fs.writeFileSync(indexPath, src.replace(search, replacement));
  console.log(`[mono-session] ${label} appliqué`);
}

function ensureOpenLifecycle() {
  let src = fs.readFileSync(indexPath, 'utf8');
  const marker = '// [MONO SESSION OPEN GUARD]';
  if (src.includes(marker)) {
    console.log('[mono-session] reconnexion annulée à ouverture déjà appliqué');
    return;
  }

  const anchor = "    } else if (connection === 'open') {";
  const count = src.split(anchor).length - 1;
  if (count !== 1) {
    throw new Error(`[mono-session] reconnexion annulée à ouverture: ancre connection=open attendue 1 fois, trouvée ${count}`);
  }

  const replacement = `${anchor}\n      ${marker}\n      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }\n      activeSock = sock;`;
  fs.writeFileSync(indexPath, src.replace(anchor, replacement));
  console.log('[mono-session] reconnexion annulée à ouverture appliqué');
}

patch(
  `let pingTimer      = null;\nlet heartbeatTimer = null;\nlet monitorTimer   = null;`,
  `let pingTimer      = null;\nlet heartbeatTimer = null;\nlet monitorTimer   = null;\nlet reconnectTimer = null;\nlet activeSock     = null;`,
  'let reconnectTimer = null;',
  'timers/socket mono-session suivis'
);

patch(
  `    }\n  });\n\n  // ════════════════════════════════════════════\n  // [SUPPRIMÉ — Phase 2, chantier Pairing/stabilisation]`,
  `    }\n  });\n  activeSock = sock;\n\n  // ════════════════════════════════════════════\n  // [SUPPRIMÉ — Phase 2, chantier Pairing/stabilisation]`,
  'activeSock = sock;',
  'socket owner actif mémorisé'
);

patch(
  `      const statusCode      = lastDisconnect?.error?.output?.statusCode;\n      const errorMessage    = lastDisconnect?.error?.message || 'inconnue';\n      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;`,
  `      const statusCode      = lastDisconnect?.error?.output?.statusCode;\n      const errorMessage    = lastDisconnect?.error?.message || 'inconnue';\n      const terminalDisconnect = [\n        DisconnectReason.loggedOut,\n        DisconnectReason.connectionReplaced,\n        DisconnectReason.badSession,\n      ].includes(statusCode);\n      const shouldReconnect = !terminalDisconnect;`,
  'const terminalDisconnect = [',
  'déconnexions terminales mono-session'
);

patch(
  `        console.log(\`🔄 Reconnexion dans \${(delay / 1000).toFixed(1)}s... (tentative #\${reconnectAttempts})\`);\n        setTimeout(() => startBot(), delay);`,
  `        console.log(\`🔄 Reconnexion dans \${(delay / 1000).toFixed(1)}s... (tentative #\${reconnectAttempts})\`);\n        if (reconnectTimer) clearTimeout(reconnectTimer);\n        reconnectTimer = setTimeout(() => {\n          reconnectTimer = null;\n          if (activeSock !== sock) return;\n          try { sock.ev?.removeAllListeners?.(); } catch (_) {}\n          activeSock = null;\n          startBot().catch(err => originalConsoleError('[Mono-Session] reconnexion impossible:', err.message));\n        }, delay);\n        if (reconnectTimer.unref) reconnectTimer.unref();`,
  "[Mono-Session] reconnexion impossible:",
  'reconnexion mono-session possédée'
);

// Ne dépend plus des lignes botReadyTime/reconnectAttempts ni de leur
// espacement : on ancre uniquement sur le début stable de connection=open.
ensureOpenLifecycle();

patch(
  `      } else {\n        // loggedOut = ban WhatsApp ou déconnexion manuelle\n        // Ne PAS reconnecter — l'utilisateur doit réappairer\n        originalConsoleLog('❌ Session loggedOut. Réappairer le bot requis.');\n        reconnectAttempts = 0;\n      }`,
  `      } else {\n        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }\n        if (activeSock === sock) activeSock = null;\n        try { sock.ev?.removeAllListeners?.(); } catch (_) {}\n        // Déconnexion terminale : ne jamais recréer automatiquement ce socket.\n        originalConsoleLog(\`❌ Session terminale (code=\${statusCode ?? '?'}). Réappairage requis.\`);\n        reconnectAttempts = 0;\n      }`,
  'Session terminale (code=',
  'arrêt terminal mono-session'
);

const check = spawnSync(process.execPath, ['--check', indexPath], { encoding: 'utf8' });
if (check.status !== 0) throw new Error(`[mono-session] syntaxe invalide index.js: ${check.stderr || check.stdout}`);

const finalIndex = fs.readFileSync(indexPath, 'utf8');
for (const required of [
  'let reconnectTimer = null;',
  'let activeSock     = null;',
  'const terminalDisconnect = [',
  "[Mono-Session] reconnexion impossible:",
  '// [MONO SESSION OPEN GUARD]',
  'Session terminale (code=',
]) {
  if (!finalIndex.includes(required)) {
    throw new Error(`[mono-session] garde-fou final absent: ${required}`);
  }
}

console.log('[mono-session] ✅ lifecycle owner mono-session stabilisé');
