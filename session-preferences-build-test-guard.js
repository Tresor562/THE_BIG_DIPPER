'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BOT = path.join(__dirname, 'bot');
const testFile = path.join(BOT, 'tests', 'session-preferences-isolation.test.js');

if (!fs.existsSync(testFile)) {
  throw new Error('[session-prefs-build-guard] test généré introuvable');
}

// Ce test doit vérifier uniquement l'isolation par AsyncLocalStorage/session.
// Il ne doit jamais ouvrir le pool Mongo réel de Render : la persistance Mongo
// est un sujet runtime distinct et ne doit pas garder le process de build vivant.
const source = `'use strict';
// [SESSION PREFS BUILD TEST — NO MONGO]
process.env.MONGODB_URI = '';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ctx = require('../utils/sessionContext');
const prefs = require('../utils/sessionPreferences');

const keys = {
  style: 3,
  prefix: '!',
  selfMode: true,
  publicMode: false,
  autoReact: true,
  autoReactMode: 'all',
  anticall: true,
  botName: 'A',
  newsletterJid: '111@newsletter',
  presence: 'recording',
  bannedUsers: ['123'],
};

function clean(sid) {
  try {
    fs.rmSync(path.join(process.cwd(), 'database', 'sessions', sid), {
      recursive: true,
      force: true,
    });
  } catch (_) {}
}

test('preferences are bidirectionally isolated', () => {
  const A = '__iso_A__';
  const B = '__iso_B__';
  clean(A);
  clean(B);
  try {
    ctx.run(A, () => {
      for (const [key, value] of Object.entries(keys)) prefs.set(key, value);
    });

    ctx.run(B, () => {
      assert.equal(prefs.get('style', 0), 0);
      assert.equal(prefs.get('prefix', '.'), '.');
      prefs.set('style', 17);
      prefs.set('prefix', '#');
      prefs.set('botName', 'B');
    });

    ctx.run(A, () => {
      assert.equal(prefs.get('style'), 3);
      assert.equal(prefs.get('prefix'), '!');
      assert.equal(prefs.get('botName'), 'A');
    });

    ctx.run(B, () => {
      assert.equal(prefs.get('style'), 17);
      assert.equal(prefs.get('prefix'), '#');
      assert.equal(prefs.get('botName'), 'B');
    });
  } finally {
    clean(A);
    clean(B);
  }
});
`;

fs.writeFileSync(testFile, source, 'utf8');

const syntax = spawnSync(process.execPath, ['--check', testFile], {
  cwd: BOT,
  encoding: 'utf8',
  timeout: 10_000,
});
if (syntax.status !== 0) {
  throw new Error(`[session-prefs-build-guard] syntaxe test invalide: ${syntax.stderr || syntax.stdout}`);
}

console.log('[session-prefs-build-guard] ✅ test session isolé de Mongo et rendu synchrone');
