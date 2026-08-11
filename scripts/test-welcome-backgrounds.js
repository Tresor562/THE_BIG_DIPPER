'use strict';

const assert = require('assert');
const {
  generateStyleBackground,
  THEMES,
  WIDTH,
  HEIGHT,
} = require('../overrides/welcomeBackground');

let generated = 0;
for (let style = 0; style <= 20; style++) {
  assert.ok(THEMES[style], `thème absent pour le style ${style}`);
  for (const type of ['welcome', 'goodbye']) {
    const buffer = generateStyleBackground(style, type);
    assert.ok(Buffer.isBuffer(buffer), `style ${style}/${type}: résultat non Buffer`);
    assert.ok(buffer.length > 1000, `style ${style}/${type}: SVG trop petit (${buffer.length})`);
    const svg = buffer.toString('utf8');
    assert.ok(svg.includes('<svg'), `style ${style}/${type}: SVG absent`);
    assert.ok(svg.includes(`width="${WIDTH}"`), `style ${style}/${type}: largeur incorrecte`);
    assert.ok(svg.includes(`height="${HEIGHT}"`), `style ${style}/${type}: hauteur incorrecte`);
    generated++;
  }
}

assert.equal(generated, 42);
console.log(`[welcome-background] ✅ ${generated} fonds générés: 21 styles × welcome/goodbye`);
