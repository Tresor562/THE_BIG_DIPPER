'use strict';

const fs = require('fs');
const path = require('path');

const testFile = path.join(__dirname, 'bot', 'tests', 'session-preferences-isolation.test.js');
if (!fs.existsSync(testFile)) {
  throw new Error('[session-preferences-test-exit] test introuvable');
}

let src = fs.readFileSync(testFile, 'utf8');
const marker = '[SESSION PREFS TEST CLOSE MONGO]';

if (!src.includes(marker)) {
  const oldBlock = '} finally {clean(A);clean(B);} });';
  const newBlock = `} finally {\n  // ${marker}\n  try {\n    if (typeof prefs.flushMongoWrites === 'function') await prefs.flushMongoWrites();\n  } finally {\n    try {\n      const mongoClient = require('../utils/mongoClient');\n      if (typeof mongoClient.closeDb === 'function') await mongoClient.closeDb();\n    } catch (_) {}\n    clean(A);\n    clean(B);\n  }\n} });`;

  const count = src.split(oldBlock).length - 1;
  if (count !== 1) {
    throw new Error(`[session-preferences-test-exit] bloc finally attendu 1 fois, trouvé ${count}`);
  }

  src = src.replace(oldBlock, newBlock);
  fs.writeFileSync(testFile, src, 'utf8');
  console.log('[session-preferences-test-exit] ✅ flush + fermeture Mongo ajoutés au test');
} else {
  console.log('[session-preferences-test-exit] déjà appliqué');
}
