/**
 * Encodeur QR minimal (mode octet, correction M, versions 1 à 6, masque 0) → SVG.
 * Suffisant pour une URL de déploiement (≤ 106 octets). Aucune dépendance.
 */

const ECC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16];
const NUM_BLOCKS = [0, 1, 1, 1, 2, 2, 4];

function rawModules(ver: number): number {
  let r = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const na = Math.floor(ver / 7) + 2;
    r -= (25 * na - 10) * na - 55;
  }
  return r;
}

function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function rsDivisor(degree: number): number[] {
  const r = new Array<number>(degree).fill(0);
  r[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < r.length; j++) {
      r[j] = gfMul(r[j], root);
      if (j + 1 < r.length) r[j] ^= r[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return r;
}

function rsRemainder(data: number[], div: number[]): number[] {
  const r = new Array<number>(div.length).fill(0);
  for (const b of data) {
    const f = b ^ (r.shift() as number);
    r.push(0);
    div.forEach((c, i) => (r[i] ^= gfMul(c, f)));
  }
  return r;
}

export function qrMatrix(text: string): boolean[][] | null {
  const bytes = Array.from(new TextEncoder().encode(text));
  let ver = 0;
  let dataCw = 0;
  for (let v = 1; v <= 6; v++) {
    const cw = Math.floor(rawModules(v) / 8) - ECC_PER_BLOCK[v] * NUM_BLOCKS[v];
    if (4 + 8 + bytes.length * 8 <= cw * 8) {
      ver = v;
      dataCw = cw;
      break;
    }
  }
  if (!ver) return null;

  // Flux de bits
  const bits: number[] = [];
  const put = (val: number, len: number): void => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  put(4, 4);
  put(bytes.length, 8);
  bytes.forEach((b) => put(b, 8));
  put(0, Math.min(4, dataCw * 8 - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    data.push(b);
  }
  for (let pad = 0xec; data.length < dataCw; pad ^= 0xec ^ 0x11) data.push(pad);

  // Blocs + ECC + entrelacement
  const nb = NUM_BLOCKS[ver];
  const eccLen = ECC_PER_BLOCK[ver];
  const raw = Math.floor(rawModules(ver) / 8);
  const numShort = nb - (raw % nb);
  const shortLen = Math.floor(raw / nb);
  const div = rsDivisor(eccLen);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < nb; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, div);
    if (i < numShort) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const final: number[] = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((b, j) => {
      if (i !== shortLen - eccLen || j >= numShort) final.push(b[i]);
    });
  }

  // Matrice
  const size = ver * 4 + 17;
  const m: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const fn: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (x: number, y: number, v: boolean): void => {
    m[y][x] = v;
    fn[y][x] = true;
  };
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  const finder = (cx: number, cy: number): void => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        set(x, y, d !== 2 && d !== 4);
      }
    }
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);
  if (ver >= 2) {
    const pos = [6, size - 7];
    for (const ax of pos) {
      for (const ay of pos) {
        if ((ax === 6 && ay === 6) || (ax === 6 && ay === size - 7) || (ax === size - 7 && ay === 6)) continue;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
  }
  // Infos de format (correction M = 0b00, masque 0)
  const fdata = (0 << 3) | 0;
  let rem = fdata;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const fbits = ((fdata << 10) | rem) ^ 0x5412;
  const fb = (i: number): boolean => ((fbits >>> i) & 1) !== 0;
  for (let i = 0; i <= 5; i++) set(8, i, fb(i));
  set(8, 7, fb(6));
  set(8, 8, fb(7));
  set(7, 8, fb(8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, fb(i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, fb(i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, fb(i));
  set(8, size - 8, true);

  // Données en zigzag + masque 0
  let bi = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const up = ((right + 1) & 2) === 0;
        const y = up ? size - 1 - vert : vert;
        if (fn[y][x]) continue;
        let v = false;
        if (bi < final.length * 8) {
          v = ((final[bi >>> 3] >>> (7 - (bi & 7))) & 1) !== 0;
          bi++;
        }
        if ((x + y) % 2 === 0) v = !v;
        m[y][x] = v;
      }
    }
  }
  return m;
}

export function qrSvg(text: string, px = 200): string {
  const m = qrMatrix(text);
  if (!m) return '';
  const size = m.length;
  const q = 4;
  let d = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) if (m[y][x]) d += `M${x + q} ${y + q}h1v1h-1z`;
  }
  const v = size + q * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${v} ${v}" shape-rendering="crispEdges"><rect width="${v}" height="${v}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
