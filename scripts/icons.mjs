// Génère les icônes PNG de la PWA (iOS n'accepte pas le SVG pour l'écran d'accueil).
// Rasteriseur minimal + encodeur PNG maison (zlib de Node), aucune dépendance.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
// Mêmes formes que public/icon.svg (repère 512×512), dans l'ordre de peinture
const shapes = [
  { poly: [[96, 400], [236, 112], [276, 112], [416, 400]], c: hex(0x2a2d3a) },
  { rect: [252, 140, 8, 40, 0], c: hex(0xffd23f) },
  { rect: [250, 220, 12, 60, 0], c: hex(0xffd23f) },
  { rect: [247, 320, 18, 70, 0], c: hex(0xffd23f) },
  { rect: [186, 300, 140, 56, 10], c: hex(0xff2d55) },
  { rect: [210, 276, 92, 34, 8], c: hex(0xff6b88) },
];
const BG = hex(0x0b0d1a);

function inPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inRect(x, y, [rx, ry, w, h, r]) {
  if (x < rx || y < ry || x > rx + w || y > ry + h) return false;
  const cx = Math.min(Math.max(x, rx + r), rx + w - r);
  const cy = Math.min(Math.max(y, ry + r), ry + h - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function sample(x, y) {
  let c = BG;
  for (const s of shapes) if (s.poly ? inPoly(x, y, s.poly) : inRect(x, y, s.rect)) c = s.c;
  return c;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function png(size) {
  const ss = 4; // suréchantillonnage 4×4 pour l'anticrénelage
  const scale = 512 / size;
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filtre « None »
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const c = sample((x + (sx + 0.5) / ss) * scale, (y + (sy + 0.5) / ss) * scale);
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const o = y * (size * 3 + 1) + 1 + x * 3;
      const n = ss * ss;
      raw[o] = Math.round(r / n); raw[o + 1] = Math.round(g / n); raw[o + 2] = Math.round(b / n);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8 bits, RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [180, 192, 512]) {
  writeFileSync(new URL(`../public/icon-${size}.png`, import.meta.url), png(size));
  console.log(`public/icon-${size}.png`);
}
