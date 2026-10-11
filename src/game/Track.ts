import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector3,
  AdditiveBlending,
  DoubleSide,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { AI, RAMP, TRACK } from '../config';
import { TrackDef, TrackTheme, trackCurve } from './tracks';
import { mulberry32 } from './rng';

const RAMP_COLOR = 0xffb020;
const RAMP_SIDE_COLOR = 0x2a2416;

export interface TrackSample {
  x: number;
  z: number;
  /** tangente (direction de course) */
  tx: number;
  tz: number;
  /** droite de la route */
  rx: number;
  rz: number;
}

export interface Projection {
  index: number;
  s: number;
  lateral: number;
}

/** Zone de tremplin : s0 = pied de la montée, s1 = bout (décollage). */
export interface RampZone {
  s0: number;
  s1: number;
}

export class Track {
  readonly n = TRACK.samples;
  readonly px = new Float32Array(this.n);
  readonly pz = new Float32Array(this.n);
  readonly tx = new Float32Array(this.n);
  readonly tz = new Float32Array(this.n);
  /** vitesse conseillée (m/s) pour l'IA, anticipation du freinage incluse */
  readonly advisory = new Float32Array(this.n);
  readonly length: number;
  readonly ds: number;
  readonly group = new Group();
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly ramps: RampZone[];

  readonly theme: TrackTheme;

  constructor(readonly def: TrackDef) {
    this.theme = def.theme;
    const curve = trackCurve(def);
    this.length = curve.getLength();
    this.ds = this.length / this.n;
    const p = new Vector3();
    const t = new Vector3();
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < this.n; i++) {
      const u = i / this.n;
      curve.getPointAt(u, p);
      curve.getTangentAt(u, t);
      t.y = 0;
      t.normalize();
      this.px[i] = p.x;
      this.pz[i] = p.z;
      this.tx[i] = t.x;
      this.tz[i] = t.z;
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    this.minX = minX; this.maxX = maxX; this.minZ = minZ; this.maxZ = maxZ;
    this.ramps = (def.ramps ?? []).map((frac) => {
      const s1 = this.wrapS(frac * this.length);
      const s0 = this.wrapS(s1 - RAMP.length);
      return { s0, s1 };
    });
    this.computeAdvisory();
    this.buildMeshes();
  }

  /** Zone de tremplin contenant s, ou null. */
  rampZoneAt(s: number): RampZone | null {
    for (const r of this.ramps) {
      if (r.s0 <= r.s1) {
        if (s >= r.s0 && s <= r.s1) return r;
      } else if (s >= r.s0 || s <= r.s1) return r;
    }
    return null;
  }

  private computeAdvisory(): void {
    const n = this.n;
    const span = 6; // échantillons pour mesurer la courbure
    const vCurve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const j = (i + span) % n;
      const k = (i - span + n) % n;
      const a1 = Math.atan2(this.tx[k], this.tz[k]);
      const a2 = Math.atan2(this.tx[j], this.tz[j]);
      let d = a2 - a1;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      const curvature = Math.abs(d) / (this.ds * span * 2);
      vCurve[i] = curvature < 1e-5 ? 999 : Math.sqrt(AI.latAccel / curvature);
    }
    // Passe arrière (2 tours) : on doit pouvoir freiner à temps pour le virage suivant.
    const decel = 20;
    const adv = this.advisory;
    for (let i = 0; i < n; i++) adv[i] = vCurve[i];
    for (let pass = 0; pass < 2; pass++) {
      for (let i = n - 1; i >= 0; i--) {
        const next = adv[(i + 1) % n];
        adv[i] = Math.min(vCurve[i], Math.sqrt(next * next + 2 * decel * this.ds));
      }
    }
  }

  /** Libère la mémoire GPU du décor (changement de circuit). */
  dispose(): void {
    this.group.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) mat.dispose();
    });
  }

  wrapS(s: number): number {
    const L = this.length;
    return ((s % L) + L) % L;
  }

  /** Échantillon interpolé à l'abscisse curviligne s. */
  sampleAt(s: number, out: TrackSample): TrackSample {
    const f = this.wrapS(s) / this.ds;
    const i = Math.floor(f) % this.n;
    const j = (i + 1) % this.n;
    const a = f - Math.floor(f);
    out.x = this.px[i] + (this.px[j] - this.px[i]) * a;
    out.z = this.pz[i] + (this.pz[j] - this.pz[i]) * a;
    let tx = this.tx[i] + (this.tx[j] - this.tx[i]) * a;
    let tz = this.tz[i] + (this.tz[j] - this.tz[i]) * a;
    const l = Math.hypot(tx, tz) || 1;
    tx /= l; tz /= l;
    out.tx = tx; out.tz = tz;
    out.rx = -tz; out.rz = tx;
    return out;
  }

  indexAt(s: number): number {
    return Math.floor(this.wrapS(s) / this.ds) % this.n;
  }

  /** Projette (x,z) sur le circuit. hint < 0 : recherche complète. */
  project(x: number, z: number, hint: number, out: Projection, range = 40): Projection {
    const n = this.n;
    let best = 0;
    let bestD = Infinity;
    if (hint < 0) {
      for (let i = 0; i < n; i++) {
        const dx = x - this.px[i], dz = z - this.pz[i];
        const d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = i; }
      }
    } else {
      for (let k = -range; k <= range; k++) {
        const i = (hint + k + n) % n;
        const dx = x - this.px[i], dz = z - this.pz[i];
        const d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = i; }
      }
    }
    const dx = x - this.px[best], dz = z - this.pz[best];
    const tx = this.tx[best], tz = this.tz[best];
    out.index = best;
    out.s = this.wrapS(best * this.ds + dx * tx + dz * tz);
    out.lateral = dx * -tz + dz * tx;
    return out;
  }

  /** Distance approximative d'un point au tracé (pour placer le décor). */
  private distanceTo(x: number, z: number): number {
    let best = Infinity;
    for (let i = 0; i < this.n; i += 3) {
      const dx = x - this.px[i], dz = z - this.pz[i];
      const d = dx * dx + dz * dz;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  // ---------------------------------------------------------------- rendu

  private buildMeshes(): void {
    const hw = TRACK.halfWidth;
    const n = this.n;

    // Sol
    const ground = new Mesh(
      new PlaneGeometry(2000, 2000).rotateX(-Math.PI / 2),
      new MeshLambertMaterial({ color: this.theme.ground }),
    );
    ground.position.set((this.minX + this.maxX) / 2, 0, (this.minZ + this.maxZ) / 2);
    this.group.add(ground);

    // Route (ruban indexé)
    const roadPos = new Float32Array((n + 1) * 2 * 3);
    for (let i = 0; i <= n; i++) {
      const k = i % n;
      const rx = -this.tz[k], rz = this.tx[k];
      roadPos.set([this.px[k] - rx * (hw + 1), 0.02, this.pz[k] - rz * (hw + 1)], i * 6);
      roadPos.set([this.px[k] + rx * (hw + 1), 0.02, this.pz[k] + rz * (hw + 1)], i * 6 + 3);
    }
    const roadIdx: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      roadIdx.push(a, b, c, b, d, c);
    }
    const roadGeo = new BufferGeometry();
    roadGeo.setAttribute('position', new BufferAttribute(roadPos, 3));
    roadGeo.setIndex(roadIdx);
    roadGeo.computeVertexNormals();
    this.group.add(new Mesh(roadGeo, new MeshLambertMaterial({ color: this.theme.road })));

    // Marquages (pointillés, bordures rouges/blanches, ligne d'arrivée) : une seule géométrie colorée
    const mPos: number[] = [];
    const mCol: number[] = [];
    const quad = (
      i0: number, i1: number, l0: number, l1: number, y: number, c: [number, number, number],
    ): void => {
      const pts: [number, number][] = [];
      for (const [i, l] of [[i0, l0], [i0, l1], [i1, l0], [i1, l1]] as const) {
        const k = i % n;
        const rx = -this.tz[k], rz = this.tx[k];
        pts.push([this.px[k] + rx * l, this.pz[k] + rz * l]);
      }
      const [a, b, cc, d] = pts;
      for (const [x, z] of [a, b, cc, b, d, cc]) {
        mPos.push(x, y, z);
        mCol.push(c[0], c[1], c[2]);
      }
    };
    const dashEvery = Math.round(7 / this.ds);
    const dashLen = Math.max(1, Math.round(3.5 / this.ds));
    for (let i = 0; i < n; i += dashEvery) quad(i, i + dashLen, -0.15, 0.15, 0.04, [0.75, 0.75, 0.7]);
    const kerbLen = Math.max(1, Math.round(3 / this.ds));
    for (let i = 0, odd = 0; i < n; i += kerbLen, odd ^= 1) {
      const c: [number, number, number] = odd ? [0.75, 0.1, 0.12] : [0.8, 0.8, 0.8];
      quad(i, i + kerbLen, -hw - 1, -hw + 0.1, 0.035, c);
      quad(i, i + kerbLen, hw - 0.1, hw + 1, 0.035, c);
    }
    // damier de départ (s = 0)
    const cols = 12;
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < cols; c++) {
        const w = (2 * hw) / cols;
        const white = (r + c) % 2 === 0;
        const col: [number, number, number] = white ? [0.95, 0.95, 0.95] : [0.05, 0.05, 0.05];
        quad(r, r + 1, -hw + c * w, -hw + (c + 1) * w, 0.045, col);
      }
    }
    const markGeo = new BufferGeometry();
    markGeo.setAttribute('position', new BufferAttribute(new Float32Array(mPos), 3));
    markGeo.setAttribute('color', new BufferAttribute(new Float32Array(mCol), 3));
    this.group.add(new Mesh(markGeo, new MeshBasicMaterial({ vertexColors: true })));

    // Murets (deux rubans verticaux)
    const wallGeo = this.buildWalls(hw + 1.6, TRACK.wallHeight);
    this.group.add(new Mesh(wallGeo, new MeshLambertMaterial({ color: this.theme.wall, side: DoubleSide })));
    // liseré lumineux sur les murets
    const stripGeo = this.buildWalls(hw + 1.55, 0.12, TRACK.wallHeight - 0.2);
    this.group.add(new Mesh(stripGeo, new MeshBasicMaterial({ color: this.theme.strip, side: DoubleSide })));

    this.buildGantry();
    this.buildLamps();
    this.buildBuildings();
    this.buildRamps();
  }

  /** Tremplins : rampe qui monte depuis la route jusqu'à RAMP.height, striée pour la visibilité. */
  private buildRamps(): void {
    if (this.ramps.length === 0) return;
    const hw = TRACK.halfWidth - 0.3;
    const segs = 14;
    const top: number[] = [];
    const sides: number[] = [];
    const samp: TrackSample = { x: 0, z: 0, tx: 0, tz: 1, rx: -1, rz: 0 };
    for (const r of this.ramps) {
      const pts: { x: number; y: number; z: number; rx: number; rz: number }[] = [];
      for (let i = 0; i <= segs; i++) {
        const s = this.wrapS(r.s0 + (RAMP.length * i) / segs);
        this.sampleAt(s, samp);
        pts.push({ x: samp.x, y: (i / segs) ** 2 * RAMP.height, z: samp.z, rx: samp.rx, rz: samp.rz });
      }
      for (let i = 0; i < segs; i++) {
        const a = pts[i], b = pts[i + 1];
        const al = [a.x - a.rx * hw, a.y, a.z - a.rz * hw];
        const ar = [a.x + a.rx * hw, a.y, a.z + a.rz * hw];
        const bl = [b.x - b.rx * hw, b.y, b.z - b.rz * hw];
        const br = [b.x + b.rx * hw, b.y, b.z + b.rz * hw];
        top.push(...al, ...ar, ...bl, ...ar, ...br, ...bl);
        const alg = [al[0], 0, al[2]];
        const blg = [bl[0], 0, bl[2]];
        sides.push(...alg, ...al, ...blg, ...al, ...bl, ...blg);
        const arg = [ar[0], 0, ar[2]];
        const brg = [br[0], 0, br[2]];
        sides.push(...arg, ...brg, ...ar, ...ar, ...brg, ...br);
      }
      // paroi verticale au bout du tremplin (le décollage)
      const last = pts[segs];
      const ll = [last.x - last.rx * hw, 0, last.z - last.rz * hw];
      const lr = [last.x + last.rx * hw, 0, last.z + last.rz * hw];
      const ul = [last.x - last.rx * hw, last.y, last.z - last.rz * hw];
      const ur = [last.x + last.rx * hw, last.y, last.z + last.rz * hw];
      sides.push(...ll, ...lr, ...ul, ...lr, ...ur, ...ul);
    }
    const topGeo = new BufferGeometry();
    topGeo.setAttribute('position', new BufferAttribute(new Float32Array(top), 3));
    topGeo.computeVertexNormals();
    this.group.add(new Mesh(topGeo, new MeshLambertMaterial({ color: RAMP_COLOR, side: DoubleSide })));
    const sideGeo = new BufferGeometry();
    sideGeo.setAttribute('position', new BufferAttribute(new Float32Array(sides), 3));
    sideGeo.computeVertexNormals();
    this.group.add(new Mesh(sideGeo, new MeshLambertMaterial({ color: RAMP_SIDE_COLOR, side: DoubleSide })));
  }

  private buildWalls(offset: number, height: number, base = 0): BufferGeometry {
    const n = this.n;
    const pos: number[] = [];
    for (const side of [-1, 1]) {
      for (let i = 0; i < n; i++) {
        const a = i, b = (i + 1) % n;
        const ax = this.px[a] + -this.tz[a] * offset * side;
        const az = this.pz[a] + this.tx[a] * offset * side;
        const bx = this.px[b] + -this.tz[b] * offset * side;
        const bz = this.pz[b] + this.tx[b] * offset * side;
        const y0 = base, y1 = base + height;
        if (side > 0) {
          pos.push(ax, y0, az, ax, y1, az, bx, y0, bz, bx, y0, bz, ax, y1, az, bx, y1, bz);
        } else {
          pos.push(ax, y0, az, bx, y0, bz, ax, y1, az, ax, y1, az, bx, y0, bz, bx, y1, bz);
        }
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    g.computeVertexNormals();
    return g;
  }

  private buildGantry(): void {
    const hw = TRACK.halfWidth + 2.2;
    const h = Math.atan2(this.tx[0], this.tz[0]);
    const parts: BufferGeometry[] = [];
    parts.push(new BoxGeometry(0.6, 7, 0.6).translate(-hw, 3.5, 0));
    parts.push(new BoxGeometry(0.6, 7, 0.6).translate(hw, 3.5, 0));
    parts.push(new BoxGeometry(hw * 2 + 0.6, 1.4, 0.5).translate(0, 7, 0));
    const frame = new Mesh(mergeGeometries(parts), new MeshLambertMaterial({ color: 0x22242e }));
    const banner = new Mesh(
      new BoxGeometry(hw * 2 - 2, 0.9, 0.55).translate(0, 7, 0),
      new MeshBasicMaterial({ color: this.theme.banner }),
    );
    for (const m of [frame, banner]) {
      m.position.set(this.px[0], 0, this.pz[0]);
      m.rotation.y = h; // l'axe x local devient la largeur de la route
      this.group.add(m);
    }
  }

  private buildLamps(): void {
    const spacing = Math.round(32 / this.ds);
    const offset = TRACK.halfWidth + 2.4;
    const spots: { x: number; z: number; hx: number; hz: number }[] = [];
    let side = 1;
    for (let i = 0; i < this.n; i += spacing, side = -side) {
      const rx = -this.tz[i], rz = this.tx[i];
      const x = this.px[i] + rx * offset * side;
      const z = this.pz[i] + rz * offset * side;
      spots.push({ x, z, hx: x - rx * side * 1.6, hz: z - rz * side * 1.6 });
    }
    const count = spots.length;
    const poles = new InstancedMesh(
      new CylinderGeometry(0.12, 0.16, 7, 5).translate(0, 3.5, 0),
      new MeshLambertMaterial({ color: 0x555a6a }),
      count,
    );
    const heads = new InstancedMesh(
      new BoxGeometry(1.2, 0.2, 0.5),
      new MeshBasicMaterial({ color: this.theme.lamp }),
      count,
    );
    const pools = new InstancedMesh(
      new CircleGeometry(4.5, 16).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({
        color: this.theme.pool,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
      count,
    );
    const o = new Object3D();
    spots.forEach((sp, i) => {
      o.position.set(sp.x, 0, sp.z);
      o.rotation.set(0, 0, 0);
      o.updateMatrix();
      poles.setMatrixAt(i, o.matrix);
      o.position.set(sp.hx, 7, sp.hz);
      o.rotation.y = Math.atan2(sp.hx - sp.x, sp.hz - sp.z) + Math.PI / 2;
      o.updateMatrix();
      heads.setMatrixAt(i, o.matrix);
      o.position.set(sp.hx, 0.05, sp.hz);
      o.rotation.set(0, 0, 0);
      o.updateMatrix();
      pools.setMatrixAt(i, o.matrix);
    });
    this.group.add(poles, heads, pools);
  }

  private buildBuildings(): void {
    const rand = mulberry32(this.def.seed);
    const step = 17;
    const margin = 150;
    const hw = TRACK.halfWidth;
    const matrices: Matrix4[] = [];
    const colors: Color[] = [];
    const palette = this.theme.palette;
    const o = new Object3D();
    for (let x = this.minX - margin; x <= this.maxX + margin; x += step) {
      for (let z = this.minZ - margin; z <= this.maxZ + margin; z += step) {
        const w = 8 + rand() * 7;
        const d = 8 + rand() * 7;
        const cx = x + (rand() - 0.5) * 3;
        const cz = z + (rand() - 0.5) * 3;
        const dist = this.distanceTo(cx, cz);
        if (dist < hw + 5 + Math.max(w, d) * 0.72 || dist > 175) continue;
        const near = 1 - Math.min(1, dist / 175);
        const h = (8 + rand() * 30 + rand() * rand() * 45 * (0.4 + near)) * this.theme.height;
        o.position.set(cx, h / 2, cz);
        o.scale.set(w, h, d);
        o.updateMatrix();
        matrices.push(o.matrix.clone());
        const c = new Color(palette[Math.floor(rand() * palette.length)]);
        c.multiplyScalar(0.8 + rand() * 0.5);
        colors.push(c);
      }
    }
    const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), buildingMaterial(this.theme.window), matrices.length);
    matrices.forEach((m, i) => {
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, colors[i]);
    });
    this.group.add(mesh);
  }
}

/** Matériau des immeubles : couleur plate + fenêtres émissives procédurales (aucune texture). */
function buildingMaterial(windowColor: number): ShaderMaterial {
  return new ShaderMaterial({
    fog: true,
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      {
        uLight: { value: new Vector3(0.4, 0.8, 0.3).normalize() },
        uWindow: { value: new Color(windowColor) },
      },
    ]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      varying vec3 vW;
      varying vec3 vN;
      varying vec3 vCol;
      void main() {
        mat4 m = modelMatrix;
        #ifdef USE_INSTANCING
          m = m * instanceMatrix;
        #endif
        vec4 wp = m * vec4(position, 1.0);
        vW = wp.xyz;
        vN = normalize(mat3(m) * normal);
        vCol = vec3(0.3);
        #ifdef USE_INSTANCING_COLOR
          vCol = instanceColor;
        #endif
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform vec3 uLight;
      uniform vec3 uWindow;
      varying vec3 vW;
      varying vec3 vN;
      varying vec3 vCol;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec3 n = normalize(vN);
        vec3 col = vCol * (0.45 + 0.55 * max(dot(n, uLight), 0.0));
        if (abs(n.y) < 0.5) {
          float u = abs(n.x) > 0.5 ? vW.z : vW.x;
          vec2 g = vec2(u / 2.4, vW.y / 3.2);
          vec2 cell = floor(g);
          vec2 f = fract(g);
          float win = step(0.28, f.x) * step(f.x, 0.72) * step(0.3, f.y) * step(f.y, 0.75);
          float seed = hash(cell + vCol.rg * 91.0);
          win *= step(0.55, seed) * step(1.5, vW.y);
          vec3 lit = mix(uWindow, vec3(0.55, 0.85, 1.0), step(0.85, seed));
          col = mix(col, lit * (0.6 + 0.4 * hash(cell * 1.7)), win);
        } else {
          col *= 0.7;
        }
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }
    `,
  });
}
