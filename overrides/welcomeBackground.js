'use strict';

const crypto = require('crypto');

const WIDTH = 1536;
const HEIGHT = 768;

const THEMES = {
  0:  { name: 'DIPPER', colors: ['#050914','#162342','#FFD54A'], motif: 'stars' },
  1:  { name: 'Dark', colors: ['#050308','#171025','#9C7CFF'], motif: 'shadow' },
  2:  { name: 'Naruto', colors: ['#160A03','#E66A11','#FFB347'], motif: 'ninja' },
  3:  { name: 'Shadow', colors: ['#020205','#10091D','#8E44AD'], motif: 'shadow' },
  4:  { name: 'Hacker', colors: ['#010604','#052014','#00FF88'], motif: 'matrix' },
  5:  { name: 'Manhwa', colors: ['#080814','#211A45','#7868FF'], motif: 'slashes' },
  6:  { name: 'Ai Oshino', colors: ['#130718','#4C164B','#FF5AA5'], motif: 'stars' },
  7:  { name: 'Ruby Oshino', colors: ['#180712','#651445','#FF7AC8'], motif: 'sparkles' },
  8:  { name: 'Satoru Gojo', colors: ['#03091A','#18387A','#64B5F6'], motif: 'infinity' },
  9:  { name: 'Oreki Houtarou', colors: ['#07100F','#1D3533','#90A4AE'], motif: 'minimal' },
  10: { name: 'Marin Kitagawa', colors: ['#190710','#6A1D48','#FF8FB1'], motif: 'hearts' },
  11: { name: 'Sung Jin-Woo', colors: ['#05020C','#221047','#7857FF'], motif: 'shards' },
  12: { name: 'Madara Uchiha', colors: ['#120202','#43070A','#D32F2F'], motif: 'rings' },
  13: { name: 'Aizen Sosuke', colors: ['#0B0710','#31233F','#B39DDB'], motif: 'rings' },
  14: { name: 'Lelouch Lamperouge', colors: ['#0A0612','#2D1645','#7E57C2'], motif: 'chess' },
  15: { name: 'Eren Yeager', colors: ['#130B08','#4C2C20','#8D6E63'], motif: 'smoke' },
  16: { name: 'Itachi Uchiha', colors: ['#100102','#42080A','#D32F2F'], motif: 'crows' },
  17: { name: 'Yhwach', colors: ['#050505','#262626','#F5F5F5'], motif: 'crosses' },
  18: { name: 'Business Pro', colors: ['#06111A','#103047','#4FC3F7'], motif: 'grid' },
  19: { name: 'Shadow Merchant', colors: ['#08040D','#271133','#7E57C2'], motif: 'lanterns' },
  20: { name: 'Purgeur Suprême', colors: ['#180301','#5C1308','#FF7043'], motif: 'fire' },
};

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function createRng() {
  let state = crypto.randomBytes(4).readUInt32LE(0) || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function ri(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function rf(rng, min, max) {
  return rng() * (max - min) + min;
}

function particles(rng, color, count = 48, minR = 1, maxR = 5, opacity = 0.55) {
  let out = '';
  for (let i = 0; i < count; i++) {
    out += `<circle cx="${ri(rng, 0, WIDTH)}" cy="${ri(rng, 0, HEIGHT)}" r="${rf(rng, minR, maxR).toFixed(1)}" fill="${color}" fill-opacity="${rf(rng, 0.12, opacity).toFixed(2)}"/>`;
  }
  return out;
}

function lines(rng, color, count = 18, opacity = 0.22) {
  let out = '';
  for (let i = 0; i < count; i++) {
    const y = ri(rng, 0, HEIGHT);
    const tilt = ri(rng, -130, 130);
    out += `<path d="M -100 ${y} L ${WIDTH + 100} ${y + tilt}" stroke="${color}" stroke-width="${ri(rng, 1, 4)}" stroke-opacity="${rf(rng, 0.05, opacity).toFixed(2)}"/>`;
  }
  return out;
}

function motifSvg(theme, rng) {
  const c = theme.colors[2];
  switch (theme.motif) {
    case 'stars':
      return particles(rng, c, 76, 1, 6, 0.72) +
        Array.from({ length: 8 }, () => {
          const x = ri(rng, 80, WIDTH - 80), y = ri(rng, 80, HEIGHT - 80), s = ri(rng, 9, 30);
          return `<path d="M${x} ${y-s} L${x+s*0.28} ${y-s*0.28} L${x+s} ${y} L${x+s*0.28} ${y+s*0.28} L${x} ${y+s} L${x-s*0.28} ${y+s*0.28} L${x-s} ${y} L${x-s*0.28} ${y-s*0.28} Z" fill="${c}" fill-opacity="0.32"/>`;
        }).join('');
    case 'sparkles':
      return particles(rng, c, 68, 2, 7, 0.6) + lines(rng, '#FFFFFF', 8, 0.12);
    case 'shadow':
      return Array.from({ length: 12 }, (_, i) => {
        const x = ri(rng, -100, WIDTH), w = ri(rng, 180, 520), h = ri(rng, 130, 420);
        return `<ellipse cx="${x}" cy="${ri(rng, 100, HEIGHT-50)}" rx="${w}" ry="${h}" fill="${c}" fill-opacity="${rf(rng, 0.025, 0.11).toFixed(2)}" transform="rotate(${ri(rng,-20,20)} ${x} 380)"/>`;
      }).join('') + particles(rng, c, 35, 1, 4, 0.35);
    case 'ninja':
      return Array.from({ length: 11 }, () => {
        const x = ri(rng, 40, WIDTH-40), y = ri(rng, 50, HEIGHT-50), r = ri(rng, 18, 50);
        return `<g transform="translate(${x} ${y}) rotate(${ri(rng,0,359)})" opacity="${rf(rng,0.09,0.23).toFixed(2)}"><path d="M0 -${r} L${r*0.27} -${r*0.25} L${r} 0 L${r*0.27} ${r*0.25} L0 ${r} L-${r*0.27} ${r*0.25} L-${r} 0 L-${r*0.27} -${r*0.25} Z" fill="${c}"/></g>`;
      }).join('') + lines(rng, c, 8, 0.13);
    case 'matrix': {
      let out = '';
      for (let x = ri(rng, 10, 40); x < WIDTH; x += ri(rng, 28, 48)) {
        const y = ri(rng, -250, 150);
        const len = ri(rng, 4, 12);
        for (let j = 0; j < len; j++) {
          out += `<text x="${x}" y="${y+j*34}" fill="${c}" fill-opacity="${Math.max(0.05,0.38-j*0.025).toFixed(2)}" font-size="22" font-family="monospace">${rng()>0.5?'1':'0'}</text>`;
        }
      }
      return out + `<rect x="0" y="0" width="100%" height="100%" fill="url(#scan)" opacity="0.18"/>`;
    }
    case 'slashes':
      return Array.from({ length: 16 }, () => {
        const x = ri(rng, -100, WIDTH), y = ri(rng, 0, HEIGHT), l = ri(rng, 120, 500);
        return `<path d="M${x} ${y} l${l} -${ri(rng,80,260)}" stroke="${c}" stroke-width="${ri(rng,2,8)}" stroke-opacity="${rf(rng,0.07,0.24).toFixed(2)}"/>`;
      }).join('');
    case 'infinity':
      return Array.from({ length: 7 }, () => {
        const x = ri(rng, 100, WIDTH-100), y = ri(rng, 80, HEIGHT-80), s = ri(rng, 45, 130);
        return `<path d="M${x-s} ${y} C${x-s/2} ${y-s},${x+s/2} ${y+s},${x+s} ${y} C${x+s/2} ${y-s},${x-s/2} ${y+s},${x-s} ${y}" fill="none" stroke="${c}" stroke-width="${ri(rng,2,7)}" stroke-opacity="${rf(rng,0.08,0.24).toFixed(2)}"/>`;
      }).join('') + particles(rng, '#FFFFFF', 40, 1, 4, 0.28);
    case 'minimal':
      return lines(rng, c, 7, 0.09) + Array.from({ length: 5 }, () => {
        const x=ri(rng,120,WIDTH-120),y=ri(rng,120,HEIGHT-120),r=ri(rng,40,150);
        return `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${c}" stroke-opacity="0.08" stroke-width="2"/>`;
      }).join('');
    case 'hearts':
      return Array.from({ length: 18 }, () => {
        const x=ri(rng,30,WIDTH-30), y=ri(rng,30,HEIGHT-30), s=ri(rng,8,28);
        return `<path d="M${x} ${y+s} C${x-s*1.5} ${y},${x-s} ${y-s},${x} ${y-s/4} C${x+s} ${y-s},${x+s*1.5} ${y},${x} ${y+s}Z" fill="${c}" fill-opacity="${rf(rng,0.08,0.28).toFixed(2)}"/>`;
      }).join('') + particles(rng, '#FFFFFF', 25, 1, 3, 0.2);
    case 'shards':
      return Array.from({ length: 24 }, () => {
        const x=ri(rng,-50,WIDTH), y=ri(rng,0,HEIGHT), w=ri(rng,30,160), h=ri(rng,80,300);
        return `<polygon points="${x},${y} ${x+w},${y-ri(rng,10,90)} ${x+w/2},${y+h}" fill="${c}" fill-opacity="${rf(rng,0.03,0.16).toFixed(2)}"/>`;
      }).join('');
    case 'rings':
      return Array.from({ length: 8 }, () => {
        const x=ri(rng,50,WIDTH-50),y=ri(rng,50,HEIGHT-50),r=ri(rng,35,180);
        return `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${c}" stroke-width="${ri(rng,2,7)}" stroke-opacity="${rf(rng,0.06,0.24).toFixed(2)}"/><circle cx="${x}" cy="${y}" r="${Math.max(10,r*0.55)}" fill="none" stroke="${c}" stroke-width="2" stroke-opacity="0.11"/>`;
      }).join('');
    case 'chess':
      return Array.from({ length: 14 }, () => {
        const x=ri(rng,40,WIDTH-40), y=ri(rng,40,HEIGHT-40), s=ri(rng,14,46);
        return `<g transform="translate(${x} ${y}) rotate(${ri(rng,-25,25)})" opacity="${rf(rng,0.07,0.2).toFixed(2)}"><path d="M-${s/2} ${s} L${s/2} ${s} L${s/3} ${s/2} L${s/4} -${s/3} L0 -${s} L-${s/4} -${s/3} L-${s/3} ${s/2} Z" fill="${c}"/></g>`;
      }).join('');
    case 'smoke':
      return Array.from({ length: 16 }, () => {
        const x=ri(rng,-100,WIDTH+100),y=ri(rng,100,HEIGHT+100),rx=ri(rng,100,350),ry=ri(rng,40,180);
        return `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#FFFFFF" fill-opacity="${rf(rng,0.015,0.07).toFixed(3)}" transform="rotate(${ri(rng,-18,18)} ${x} ${y})"/>`;
      }).join('') + lines(rng, c, 6, 0.1);
    case 'crows':
      return Array.from({ length: 22 }, () => {
        const x=ri(rng,20,WIDTH-20), y=ri(rng,30,HEIGHT-30), s=ri(rng,8,32);
        return `<path d="M${x-s} ${y} Q${x-s/2} ${y-s} ${x} ${y} Q${x+s/2} ${y-s} ${x+s} ${y}" fill="none" stroke="#050505" stroke-width="${Math.max(2,s/5)}" stroke-opacity="${rf(rng,0.25,0.65).toFixed(2)}"/>`;
      }).join('') + particles(rng, c, 30, 1, 3, 0.25);
    case 'crosses':
      return Array.from({ length: 16 }, () => {
        const x=ri(rng,40,WIDTH-40),y=ri(rng,40,HEIGHT-40),s=ri(rng,16,55);
        return `<path d="M${x-s/4} ${y-s} H${x+s/4} V${y-s/4} H${x+s} V${y+s/4} H${x+s/4} V${y+s} H${x-s/4} V${y+s/4} H${x-s} V${y-s/4} H${x-s/4} Z" fill="${c}" fill-opacity="${rf(rng,0.05,0.18).toFixed(2)}"/>`;
      }).join('');
    case 'grid': {
      let out = '';
      const gap = ri(rng, 48, 76);
      for (let x = -100; x <= WIDTH+100; x += gap) out += `<line x1="${x}" y1="0" x2="${x+ri(rng,-80,80)}" y2="${HEIGHT}" stroke="${c}" stroke-opacity="0.08"/>`;
      for (let y = 0; y <= HEIGHT; y += gap) out += `<line x1="0" y1="${y}" x2="${WIDTH}" y2="${y}" stroke="${c}" stroke-opacity="0.07"/>`;
      return out;
    }
    case 'lanterns':
      return Array.from({ length: 12 }, () => {
        const x=ri(rng,40,WIDTH-40), y=ri(rng,30,HEIGHT-80), w=ri(rng,18,50), h=ri(rng,30,90);
        return `<g opacity="${rf(rng,0.06,0.2).toFixed(2)}"><line x1="${x}" y1="0" x2="${x}" y2="${y}" stroke="${c}"/><rect x="${x-w/2}" y="${y}" width="${w}" height="${h}" rx="8" fill="${c}"/><circle cx="${x}" cy="${y+h/2}" r="${w*0.7}" fill="${c}" fill-opacity="0.2"/></g>`;
      }).join('');
    case 'fire':
      return Array.from({ length: 26 }, () => {
        const x=ri(rng,0,WIDTH), y=ri(rng,HEIGHT-220,HEIGHT+50), h=ri(rng,60,260), w=ri(rng,15,70);
        return `<path d="M${x} ${y} C${x-w} ${y-h*0.25},${x+w} ${y-h*0.55},${x} ${y-h} C${x+w*1.3} ${y-h*0.55},${x+w} ${y-h*0.2},${x} ${y}Z" fill="${c}" fill-opacity="${rf(rng,0.05,0.22).toFixed(2)}"/>`;
      }).join('') + particles(rng, '#FFD180', 40, 1, 4, 0.4);
    default:
      return particles(rng, c, 50, 1, 5, 0.4);
  }
}

function generateStyleBackground(style = 0, eventType = 'welcome') {
  const theme = THEMES[style] || THEMES[0];
  const rng = createRng();
  const [base, mid, accent] = theme.colors;
  const angle = ri(rng, 0, 360);
  const glowX = ri(rng, 15, 85);
  const glowY = ri(rng, 10, 90);
  const glow2X = ri(rng, 5, 95);
  const glow2Y = ri(rng, 5, 95);
  const eventTint = eventType === 'goodbye' ? '#FF5252' : accent;

  const svg = `
  <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="base" x1="0" y1="0" x2="1" y2="1" gradientTransform="rotate(${angle} .5 .5)">
        <stop offset="0" stop-color="${base}"/>
        <stop offset="0.52" stop-color="${mid}"/>
        <stop offset="1" stop-color="${base}"/>
      </linearGradient>
      <radialGradient id="glow1" cx="${glowX}%" cy="${glowY}%" r="58%">
        <stop offset="0" stop-color="${accent}" stop-opacity="0.42"/>
        <stop offset="1" stop-color="${accent}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="glow2" cx="${glow2X}%" cy="${glow2Y}%" r="46%">
        <stop offset="0" stop-color="${eventTint}" stop-opacity="0.22"/>
        <stop offset="1" stop-color="${eventTint}" stop-opacity="0"/>
      </radialGradient>
      <pattern id="scan" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0 0 H8" stroke="#FFFFFF" stroke-opacity="0.12"/></pattern>
      <filter id="blur"><feGaussianBlur stdDeviation="34"/></filter>
    </defs>
    <rect width="100%" height="100%" fill="url(#base)"/>
    <rect width="100%" height="100%" fill="url(#glow1)"/>
    <rect width="100%" height="100%" fill="url(#glow2)"/>
    ${motifSvg(theme, rng)}
    <ellipse cx="${ri(rng,100,WIDTH-100)}" cy="${ri(rng,80,HEIGHT-80)}" rx="${ri(rng,180,430)}" ry="${ri(rng,80,260)}" fill="${accent}" fill-opacity="0.07" filter="url(#blur)"/>
    <rect width="100%" height="100%" fill="#000" fill-opacity="0.08"/>
    <text x="${WIDTH-42}" y="${HEIGHT-28}" text-anchor="end" fill="#FFFFFF" fill-opacity="0.09" font-size="22" font-family="DejaVu Sans,Arial,sans-serif">${esc(theme.name)}</text>
  </svg>`;

  return Buffer.from(svg);
}

module.exports = { generateStyleBackground, THEMES, WIDTH, HEIGHT };
