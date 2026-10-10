import { CatmullRomCurve3, Vector3 } from 'three';

export interface TrackTheme {
  sky: number;
  ground: number;
  road: number;
  wall: number;
  strip: number; // liseré lumineux des murets
  banner: number; // bandeau du portique d'arrivée
  lamp: number;
  pool: number; // halo des lampadaires au sol
  palette: number[]; // couleurs des immeubles
  window: number; // couleur dominante des fenêtres
  fogFar: number;
  /** échelle de hauteur des immeubles */
  height: number;
}

export interface TrackDef {
  id: string;
  name: string;
  subtitle: string;
  laps: number;
  seed: number;
  points: [number, number][];
  theme: TrackTheme;
}

export const TRACKS: TrackDef[] = [
  {
    id: 'downtown',
    name: 'DOWNTOWN',
    subtitle: 'Le centre-ville, équilibré',
    laps: 3,
    seed: 1337,
    points: [
      [0, 0], [120, 0], [220, -10], [290, 40], [300, 130], [250, 190], [170, 180],
      [120, 230], [130, 320], [60, 370], [-60, 360], [-130, 300], [-120, 200],
      [-190, 140], [-210, 50], [-140, -20], [-60, -10],
    ],
    theme: {
      sky: 0x0b0d1a, ground: 0x14151e, road: 0x3b3d4a, wall: 0x7a7f96, strip: 0x2de2ff,
      banner: 0xff2d55, lamp: 0xffd9a0, pool: 0x5a4628,
      palette: [0x2b2f45, 0x3a2f4a, 0x1f3a44, 0x45384a, 0x30343c, 0x283a30],
      window: 0xffc773, fogFar: 280, height: 1,
    },
  },
  {
    id: 'port',
    name: 'PORT',
    subtitle: 'Docks et longues lignes droites',
    laps: 3,
    seed: 2024,
    points: [
      [0, 0], [200, 0], [320, 10], [360, 80], [330, 160], [240, 170], [200, 220],
      [230, 300], [180, 360], [60, 350], [-40, 300], [-60, 200], [-140, 170],
      [-170, 90], [-120, 20],
    ],
    theme: {
      sky: 0x07151a, ground: 0x10181a, road: 0x363f42, wall: 0x8a7a5a, strip: 0xffb02d,
      banner: 0x2d7bff, lamp: 0xffb070, pool: 0x5a3a18,
      palette: [0x1f4a5a, 0x5a2f22, 0x2a4f3a, 0x6a5a2a, 0x2d3540, 0x4a2a4a],
      window: 0xffa860, fogFar: 260, height: 0.55,
    },
  },
  {
    id: 'chinatown',
    name: 'CHINATOWN',
    subtitle: 'Court, serré, technique',
    laps: 4,
    seed: 888,
    points: [
      [0, 0], [90, 0], [150, 30], [160, 100], [100, 120], [80, 170], [120, 210],
      [110, 270], [30, 295], [-50, 265], [-65, 200], [-130, 170], [-150, 95],
      [-100, 50], [-70, 10],
    ],
    theme: {
      sky: 0x1a0812, ground: 0x1a1216, road: 0x3e3438, wall: 0x8a4a4a, strip: 0xff2dd5,
      banner: 0xffd23f, lamp: 0xff8a6b, pool: 0x5a2020,
      palette: [0x5a1f22, 0x3a2a1f, 0x4a1a3a, 0x2a3a2a, 0x6a3a1a, 0x30222a],
      window: 0xff6b6b, fogFar: 230, height: 0.8,
    },
  },
  {
    id: 'autoroute',
    name: 'AUTOROUTE',
    subtitle: 'Grandes courbes, pied au plancher',
    laps: 3,
    seed: 77,
    points: [
      [0, 0], [300, -20], [500, 60], [560, 220], [480, 380], [300, 420], [160, 360],
      [60, 420], [-120, 400], [-220, 280], [-200, 120], [-120, 30],
    ],
    theme: {
      sky: 0x0e0a22, ground: 0x121222, road: 0x34364a, wall: 0x6a6a8a, strip: 0xffd23f,
      banner: 0x9b5cff, lamp: 0xc8d8ff, pool: 0x2a3050,
      palette: [0x2a2a50, 0x3a2050, 0x203a50, 0x30304a, 0x452a3a, 0x203040],
      window: 0x9fd0ff, fogFar: 330, height: 1.35,
    },
  },
];

export function trackById(id: string): TrackDef {
  return TRACKS.find((t) => t.id === id) ?? TRACKS[0];
}

export function trackCurve(def: TrackDef): CatmullRomCurve3 {
  return new CatmullRomCurve3(def.points.map(([x, z]) => new Vector3(x, 0, z)), true, 'centripetal');
}

/** Tracé SVG (vue de dessus) pour les écrans de sélection. */
export function trackSvg(def: TrackDef, color: string): string {
  const c = trackCurve(def);
  const pts = c.getSpacedPoints(120);
  const xs = pts.map((p) => p.x), zs = pts.map((p) => p.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const size = Math.max(maxX - minX, maxZ - minZ);
  const pad = size * 0.08;
  // même orientation que la mini-map (rotation de 180°)
  const d = pts
    .map((p, i) => `${i ? 'L' : 'M'}${(maxX - p.x + pad).toFixed(1)} ${(maxZ - p.z + pad).toFixed(1)}`)
    .join('');
  const vb = `0 0 ${(maxX - minX + pad * 2).toFixed(0)} ${(maxZ - minZ + pad * 2).toFixed(0)}`;
  const sw = (size / 22).toFixed(1);
  const s = pts[0];
  return `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg"><path d="${d}Z" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linejoin="round"/><circle cx="${(maxX - s.x + pad).toFixed(1)}" cy="${(maxZ - s.z + pad).toFixed(1)}" r="${(size / 22).toFixed(1)}" fill="#fff"/></svg>`;
}
