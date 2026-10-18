import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CarCosmetics, STOCK_COSMETICS } from '../config';
import { toonGradient } from './Toon';

/** Applique une couleur de sommet uniforme et retire les UV (inutiles, pas de textures). */
export function tint(g: BufferGeometry, c: number | [number, number, number]): BufferGeometry {
  g.deleteAttribute('uv');
  const ng = g.index ? g.toNonIndexed() : g;
  const col = typeof c === 'number' ? new Color(c) : new Color(c[0], c[1], c[2]);
  const n = ng.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([col.r, col.g, col.b], i * 3);
  ng.setAttribute('color', new BufferAttribute(arr, 3));
  return ng;
}

const WHITE = 0xffffff; // multiplié par la couleur de la voiture
const GLASS = 0x1a1f2a;
const TYRE = 0x111111;

// ---------------------------------------------------------------- carrosseries (6 silhouettes)

export type CarArchetype = 'sport' | 'hatch' | 'drift' | 'super' | 'muscle' | 'truck';

interface BodyParams {
  length: number; // longueur totale (pare-chocs à pare-chocs)
  width: number;
  rideH: number; // garde au sol du bas de caisse
  bodyH: number; // hauteur du bas de caisse (ceinture - bas de caisse)
  hoodLen: number;
  hoodH: number; // hauteur absolue du capot
  cabinLen: number;
  cabinSetback: number; // espace entre fin du capot et début de la cabine
  roofH: number; // hauteur absolue du toit
  roofLen: number;
  roofWFrac: number; // largeur du toit / largeur caisse (effet pavillon fuyant)
  deckH: number; // hauteur absolue de la malle (style 'trunk' uniquement)
  wheelR: number;
  wheelW: number;
  wheelFrontZ: number;
  wheelRearZ: number;
  flare: number; // débord des arches
  rearStyle: 'trunk' | 'fastback' | 'bed';
}

/** Six silhouettes inspirées de grandes familles automobiles réelles (formes génériques, pas de marque). */
const BODY_PRESETS: Record<CarArchetype, BodyParams> = {
  // coupé GT sportif (type Supra/370Z) : capot long, custode fuyante, empattement équilibré
  sport: {
    length: 4.3, width: 1.88, rideH: 0.28, bodyH: 0.5,
    hoodLen: 1.3, hoodH: 0.82, cabinLen: 1.5, cabinSetback: 0.05,
    roofH: 1.28, roofLen: 1.45, roofWFrac: 0.82, deckH: 0.86,
    wheelR: 0.36, wheelW: 0.3, wheelFrontZ: 1.3, wheelRearZ: -1.3,
    flare: 0.05, rearStyle: 'trunk',
  },
  // compacte sportive à traction (type GTI/Civic Type R) : plus courte, habitacle généreux, hayon
  hatch: {
    length: 3.9, width: 1.82, rideH: 0.26, bodyH: 0.52,
    hoodLen: 0.95, hoodH: 0.8, cabinLen: 1.7, cabinSetback: 0,
    roofH: 1.34, roofLen: 1.75, roofWFrac: 0.86, deckH: 0.82,
    wheelR: 0.34, wheelW: 0.28, wheelFrontZ: 1.1, wheelRearZ: -0.95,
    flare: 0.04, rearStyle: 'fastback',
  },
  // coupé léger à propulsion (type AE86/RX-7) : bas, custode arrière prononcée, arches marquées
  drift: {
    length: 4.1, width: 1.78, rideH: 0.27, bodyH: 0.46,
    hoodLen: 1.15, hoodH: 0.76, cabinLen: 1.3, cabinSetback: 0,
    roofH: 1.18, roofLen: 1.3, roofWFrac: 0.8, deckH: 0.76,
    wheelR: 0.35, wheelW: 0.29, wheelFrontZ: 1.1, wheelRearZ: -1.4,
    flare: 0.08, rearStyle: 'fastback',
  },
  // supercar à moteur central : très bas et large, nez en coin, porte-à-faux minimes
  super: {
    length: 4.5, width: 1.98, rideH: 0.22, bodyH: 0.42,
    hoodLen: 1.5, hoodH: 0.56, cabinLen: 1.1, cabinSetback: 0.15,
    roofH: 1.0, roofLen: 1.0, roofWFrac: 0.74, deckH: 0.68,
    wheelR: 0.37, wheelW: 0.33, wheelFrontZ: 1.2, wheelRearZ: -1.3,
    flare: 0.11, rearStyle: 'trunk',
  },
  // muscle car moderne : capot interminable, hanches arrière larges, propulsion
  muscle: {
    length: 4.55, width: 1.95, rideH: 0.28, bodyH: 0.52,
    hoodLen: 1.7, hoodH: 0.84, cabinLen: 1.25, cabinSetback: 0,
    roofH: 1.3, roofLen: 1.2, roofWFrac: 0.8, deckH: 0.86,
    wheelR: 0.37, wheelW: 0.32, wheelFrontZ: 1.3, wheelRearZ: -1.35,
    flare: 0.09, rearStyle: 'trunk',
  },
  // pick-up tout-terrain : garde au sol élevée, cabine haute et carrée, plateau ouvert
  truck: {
    length: 4.7, width: 1.92, rideH: 0.42, bodyH: 0.5,
    hoodLen: 1.25, hoodH: 1.0, cabinLen: 1.5, cabinSetback: 0,
    roofH: 1.55, roofLen: 1.4, roofWFrac: 0.88, deckH: 0.92,
    wheelR: 0.44, wheelW: 0.36, wheelFrontZ: 1.35, wheelRearZ: -1.35,
    flare: 0.14, rearStyle: 'bed',
  },
};

function buildBody(p: BodyParams): BufferGeometry {
  const front = p.length / 2, rear = -p.length / 2;
  const bodyY0 = p.rideH, bodyY1 = p.rideH + p.bodyH;
  const bodyYc = (bodyY0 + bodyY1) / 2;
  const parts: BufferGeometry[] = [];

  const hoodZ1 = front, hoodZ0 = front - p.hoodLen;
  const cabinZ1 = hoodZ0 - p.cabinSetback, cabinZ0 = cabinZ1 - p.cabinLen;
  const deckZ1 = cabinZ0, deckZ0 = rear;

  if (p.rearStyle === 'bed') {
    // caisse pleine sous capot + cabine seulement, plateau ouvert (plancher + ridelles) à l'arrière
    const cabinFrontLen = front - deckZ1;
    parts.push(tint(new BoxGeometry(p.width, p.bodyH, cabinFrontLen).translate(0, bodyYc, (front + deckZ1) / 2), WHITE));
    const bedFloorY = bodyY0 + 0.08;
    parts.push(tint(new BoxGeometry(p.width * 0.92, 0.1, deckZ1 - deckZ0).translate(0, bedFloorY, (deckZ0 + deckZ1) / 2), WHITE));
    for (const side of [-1, 1]) {
      parts.push(
        tint(
          new BoxGeometry(0.08, p.bodyH * 0.75, deckZ1 - deckZ0)
            .translate(side * p.width * 0.46, bedFloorY + p.bodyH * 0.3, (deckZ0 + deckZ1) / 2),
          WHITE,
        ),
      );
    }
  } else {
    parts.push(tint(new BoxGeometry(p.width, p.bodyH, p.length).translate(0, bodyYc, 0), WHITE));
  }

  // capot : panneau surélevé par rapport au bas de caisse
  const hoodBot = bodyY0 + p.bodyH * 0.55;
  if (p.hoodH > hoodBot) {
    parts.push(
      tint(new BoxGeometry(p.width * 0.96, p.hoodH - hoodBot, p.hoodLen).translate(0, (hoodBot + p.hoodH) / 2, (hoodZ0 + hoodZ1) / 2), WHITE),
    );
  }

  // malle arrière surélevée (style « trunk » uniquement ; fastback/bed restent au ras de la caisse)
  if (p.rearStyle === 'trunk' && p.deckH > hoodBot) {
    parts.push(
      tint(new BoxGeometry(p.width * 0.96, p.deckH - hoodBot, deckZ1 - deckZ0).translate(0, (hoodBot + p.deckH) / 2, (deckZ0 + deckZ1) / 2), WHITE),
    );
  }

  // vitrage
  const glassY0 = bodyY0 + p.bodyH * 0.85;
  parts.push(
    tint(new BoxGeometry(p.width * 0.86, Math.max(0.1, p.roofH - glassY0), cabinZ1 - cabinZ0).translate(0, (glassY0 + p.roofH) / 2, (cabinZ0 + cabinZ1) / 2), GLASS),
  );

  // toit
  const roofLen = Math.min(p.roofLen, cabinZ1 - cabinZ0);
  parts.push(tint(new BoxGeometry(p.width * p.roofWFrac, 0.07, roofLen).translate(0, p.roofH - 0.035, (cabinZ0 + cabinZ1) / 2), WHITE));

  // roues + arches
  for (const wz of [p.wheelFrontZ, p.wheelRearZ]) {
    for (const sx of [-1, 1]) {
      const wx = sx * (p.width / 2 - p.wheelW * 0.25 + p.flare);
      parts.push(tint(new BoxGeometry(0.1, 0.22, 0.24).translate(wx, p.wheelR + 0.5, wz), TYRE));
      parts.push(tint(new CylinderGeometry(p.wheelR, p.wheelR, p.wheelW, 10).rotateZ(Math.PI / 2).translate(wx, p.wheelR, wz), TYRE));
    }
  }

  return mergeGeometries(parts);
}

// ---------------------------------------------------------------- esthétique (boutique)

/** Aileron : « stock »/« gt » reprennent la couleur de la carrosserie (tint WHITE), « drift » est carbone fixe. */
function buildSpoiler(id: string): { geo: BufferGeometry; carColored: boolean } {
  switch (id) {
    case 'gt':
      return {
        geo: mergeGeometries([
          tint(new BoxGeometry(1.92, 0.08, 0.48).translate(0, 1.24, -2.0), WHITE),
          tint(new BoxGeometry(0.1, 0.3, 0.12).translate(0.8, 1.02, -1.92), WHITE),
          tint(new BoxGeometry(0.1, 0.3, 0.12).translate(-0.8, 1.02, -1.92), WHITE),
        ]),
        carColored: true,
      };
    case 'drift':
      return {
        geo: mergeGeometries([
          tint(new BoxGeometry(2.1, 0.08, 0.56).translate(0, 1.4, -2.05), 0x15161c),
          tint(new BoxGeometry(0.12, 0.42, 0.14).translate(0.88, 1.12, -1.95), 0x15161c),
          tint(new BoxGeometry(0.12, 0.42, 0.14).translate(-0.88, 1.12, -1.95), 0x15161c),
        ]),
        carColored: false,
      };
    default: // 'stock' : le petit aileron d'origine
      return { geo: tint(new BoxGeometry(1.84, 0.07, 0.42).translate(0, 1.08, -1.95), WHITE), carColored: true };
  }
}

/** Pot d'échappement : toujours métal/chromé, jamais teinté par la couleur de la voiture. */
function buildExhaust(id: string): BufferGeometry {
  const pipe = (x: number, r: number, len: number): BufferGeometry =>
    new CylinderGeometry(r, r, len, 8).rotateX(Math.PI / 2).translate(x, 0.22, -2.1 - len / 2);
  switch (id) {
    case 'dual':
      return mergeGeometries([tint(pipe(0.5, 0.08, 0.32), 0xcfd3dc), tint(pipe(-0.5, 0.08, 0.32), 0xcfd3dc)]);
    case 'chrome':
      return tint(pipe(0, 0.17, 0.4), 0xf2f4fa);
    default: // 'stock'
      return tint(pipe(0.45, 0.065, 0.26), 0x3a3a40);
  }
}

/** Stickers : fines plaques collées sur la carrosserie, couleur fixe (jamais teintées par la voiture). */
function buildSticker(id: string): BufferGeometry | null {
  switch (id) {
    case 'stripes': {
      const parts: BufferGeometry[] = [];
      for (const x of [-0.22, 0.22]) {
        parts.push(tint(new BoxGeometry(0.14, 0.012, 1.1).translate(x, 0.957, 1.4), 0xf4f6ff)); // capot
        parts.push(tint(new BoxGeometry(0.14, 0.012, 1.55).translate(x, 1.327, -0.35), 0xf4f6ff)); // toit
      }
      return mergeGeometries(parts);
    }
    case 'flames':
      return mergeGeometries(
        [-1, 1].map((s) => tint(new BoxGeometry(0.025, 0.16, 3.2).translate(s * 0.963, 0.62, -0.2), 0xff6a1a)),
      );
    case 'tribal':
      return mergeGeometries(
        [-1, 1].map((s) => tint(new BoxGeometry(0.025, 0.1, 2.6).translate(s * 0.963, 0.78, -0.3), 0x2de2ff)),
      );
    default: // 'none'
      return null;
  }
}

/** Les pièces de boutique sont dessinées pour la silhouette « sport » (4.2 × 1.9 × ~0.8) ; on les remet à l'échelle
 *  par un facteur uniforme par axe pour qu'elles s'accordent à chaque silhouette sans dupliquer leur géométrie. */
function cosmeticScale(p: BodyParams): [number, number, number] {
  return [p.width / 1.9, (p.rideH + p.bodyH + 0.25) / 0.8, p.length / 4.2];
}

function buildLights(p: BodyParams): BufferGeometry {
  const hw = p.width / 2, y = p.rideH + p.bodyH * 0.65, front = p.length / 2, rear = -p.length / 2;
  return mergeGeometries([
    tint(new BoxGeometry(0.42, 0.14, 0.06).translate(hw * 0.58, y, front - 0.01), 0xfff4c8),
    tint(new BoxGeometry(0.42, 0.14, 0.06).translate(-hw * 0.58, y, front - 0.01), 0xfff4c8),
    tint(new BoxGeometry(0.55, 0.12, 0.06).translate(hw * 0.52, y + 0.06, rear + 0.01), 0xff1030),
    tint(new BoxGeometry(0.55, 0.12, 0.06).translate(-hw * 0.52, y + 0.06, rear + 0.01), 0xff1030),
  ]);
}

/** Faisceau des phares au sol : trapèze en dégradé, rendu en additif. */
function buildBeam(p: BodyParams): BufferGeometry {
  const g = new BufferGeometry();
  const y = 0.06, hw = p.width * 0.42, z0 = p.length / 2 + 0.1, z1 = z0 + 13.8;
  const pos = new Float32Array([
    -hw, y, z0, hw, y, z0, -4, y, z1, hw, y, z0, 4, y, z1, -4, y, z1,
  ]);
  const a = 0.32, b = 0;
  const col = new Float32Array([
    a, a * 0.95, a * 0.8, a, a * 0.95, a * 0.8, b, b, b,
    a, a * 0.95, a * 0.8, b, b, b, b, b, b,
  ]);
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('color', new BufferAttribute(col, 3));
  return g;
}

interface ArchetypeGeo {
  body: BufferGeometry;
  lights: BufferGeometry;
  beam: BufferGeometry;
  scale: [number, number, number];
}

const geoCache = new Map<CarArchetype, ArchetypeGeo>();
function archetypeGeo(archetype: CarArchetype): ArchetypeGeo {
  let g = geoCache.get(archetype);
  if (!g) {
    const p = BODY_PRESETS[archetype];
    g = { body: buildBody(p), lights: buildLights(p), beam: buildBeam(p), scale: cosmeticScale(p) };
    geoCache.set(archetype, g);
  }
  return g;
}

export const lightMat = new MeshBasicMaterial({ vertexColors: true });
export const beamMat = new MeshBasicMaterial({
  vertexColors: true,
  transparent: true,
  blending: AdditiveBlending,
  depthWrite: false,
  side: DoubleSide,
});

const neutralMat = new MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonGradient });
/** Silhouette noire derrière la carrosserie (coque inversée) : le contour cell-shadé qui « assume » le style bas-poly. */
const outlineMat = new MeshBasicMaterial({ color: 0x0a0a14, side: BackSide });
const OUTLINE_SCALE = 1.035;

export function createCarMesh(archetype: CarArchetype, color: number, cosmetics: CarCosmetics = STOCK_COSMETICS): Group {
  const geo = archetypeGeo(archetype);
  const g = new Group();
  const outline = new Mesh(geo.body, outlineMat);
  outline.scale.setScalar(OUTLINE_SCALE);
  g.add(outline);
  // peinture carrosserie : ombrage à paliers (toon), pas de dégradé PBR continu
  const carMat = new MeshToonMaterial({ color, vertexColors: true, gradientMap: toonGradient });
  g.add(new Mesh(geo.body, carMat));
  g.add(new Mesh(geo.lights, lightMat));
  g.add(new Mesh(geo.beam, beamMat));

  const [sx, sy, sz] = geo.scale;
  const spoiler = buildSpoiler(cosmetics.spoiler);
  const spoilerMesh = new Mesh(spoiler.geo, spoiler.carColored ? carMat : neutralMat);
  spoilerMesh.scale.set(sx, sy, sz);
  g.add(spoilerMesh);
  const exhaustMesh = new Mesh(buildExhaust(cosmetics.exhaust), neutralMat);
  exhaustMesh.scale.set(sx, sy, sz);
  g.add(exhaustMesh);
  const sticker = buildSticker(cosmetics.sticker);
  if (sticker) {
    const stickerMesh = new Mesh(sticker, neutralMat);
    stickerMesh.scale.set(sx, sy, sz);
    g.add(stickerMesh);
  }

  return g;
}

/** Ensemble instancié (trafic) : 3 draw calls quel que soit le nombre de voitures. */
export function createCarInstances(
  archetype: CarArchetype,
  count: number,
): { body: InstancedMesh; lights: InstancedMesh; beam: InstancedMesh } {
  const geo = archetypeGeo(archetype);
  const body = new InstancedMesh(geo.body, new MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient }), count);
  const lights = new InstancedMesh(geo.lights, lightMat, count);
  const beam = new InstancedMesh(geo.beam, beamMat, count);
  for (const m of [body, lights, beam]) m.frustumCulled = false;
  return { body, lights, beam };
}

/** Gyrophare de police : deux blocs dont la couleur alterne. */
export function createSirenLights(): { group: Group; red: MeshBasicMaterial; blue: MeshBasicMaterial } {
  const red = new MeshBasicMaterial({ color: 0xff0000 });
  const blue = new MeshBasicMaterial({ color: 0x0044ff });
  const group = new Group();
  const bar = new BoxGeometry(0.55, 0.16, 0.32);
  const r = new Mesh(bar, red);
  r.position.set(-0.32, 1.42, -0.35);
  const b = new Mesh(bar, blue);
  b.position.set(0.32, 1.42, -0.35);
  group.add(r, b);
  return { group, red, blue };
}
