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

function buildBody(): BufferGeometry {
  const parts: BufferGeometry[] = [
    tint(new BoxGeometry(1.9, 0.5, 4.2).translate(0, 0.55, 0), WHITE),
    tint(new BoxGeometry(1.86, 0.18, 1.2).translate(0, 0.86, 1.4), WHITE), // capot
    tint(new BoxGeometry(1.62, 0.46, 1.9).translate(0, 1.03, -0.3), GLASS),
    tint(new BoxGeometry(1.56, 0.07, 1.6).translate(0, 1.29, -0.35), WHITE), // toit
    tint(new BoxGeometry(0.08, 0.26, 0.2).translate(0.6, 0.9, -1.95), TYRE),
    tint(new BoxGeometry(0.08, 0.26, 0.2).translate(-0.6, 0.9, -1.95), TYRE),
  ];
  for (const x of [-0.92, 0.92]) {
    for (const z of [-1.35, 1.35]) {
      parts.push(tint(new CylinderGeometry(0.36, 0.36, 0.3, 10).rotateZ(Math.PI / 2).translate(x, 0.36, z), TYRE));
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

function buildLights(): BufferGeometry {
  return mergeGeometries([
    tint(new BoxGeometry(0.42, 0.14, 0.06).translate(0.6, 0.62, 2.11), 0xfff4c8),
    tint(new BoxGeometry(0.42, 0.14, 0.06).translate(-0.6, 0.62, 2.11), 0xfff4c8),
    tint(new BoxGeometry(0.55, 0.12, 0.06).translate(0.58, 0.68, -2.11), 0xff1030),
    tint(new BoxGeometry(0.55, 0.12, 0.06).translate(-0.58, 0.68, -2.11), 0xff1030),
  ]);
}

/** Faisceau des phares au sol : trapèze en dégradé, rendu en additif. */
function buildBeam(): BufferGeometry {
  const g = new BufferGeometry();
  const y = 0.06;
  const pos = new Float32Array([
    -0.8, y, 2.2, 0.8, y, 2.2, -4, y, 16, 0.8, y, 2.2, 4, y, 16, -4, y, 16,
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

export const CarGeo = {
  body: buildBody(),
  lights: buildLights(),
  beam: buildBeam(),
};

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

export function createCarMesh(color: number, cosmetics: CarCosmetics = STOCK_COSMETICS): Group {
  const g = new Group();
  const outline = new Mesh(CarGeo.body, outlineMat);
  outline.scale.setScalar(OUTLINE_SCALE);
  g.add(outline);
  // peinture carrosserie : ombrage à paliers (toon), pas de dégradé PBR continu
  const carMat = new MeshToonMaterial({ color, vertexColors: true, gradientMap: toonGradient });
  g.add(new Mesh(CarGeo.body, carMat));
  g.add(new Mesh(CarGeo.lights, lightMat));
  g.add(new Mesh(CarGeo.beam, beamMat));

  const spoiler = buildSpoiler(cosmetics.spoiler);
  g.add(new Mesh(spoiler.geo, spoiler.carColored ? carMat : neutralMat));
  g.add(new Mesh(buildExhaust(cosmetics.exhaust), neutralMat));
  const sticker = buildSticker(cosmetics.sticker);
  if (sticker) g.add(new Mesh(sticker, neutralMat));

  return g;
}

/** Ensemble instancié (trafic) : 3 draw calls quel que soit le nombre de voitures. */
export function createCarInstances(count: number): {
  body: InstancedMesh;
  lights: InstancedMesh;
  beam: InstancedMesh;
} {
  const body = new InstancedMesh(
    CarGeo.body,
    new MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient }),
    count,
  );
  const lights = new InstancedMesh(CarGeo.lights, lightMat, count);
  const beam = new InstancedMesh(CarGeo.beam, beamMat, count);
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
