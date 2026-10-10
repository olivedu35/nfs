import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Mesh,
  MeshBasicMaterial,
} from 'three';

const N = 24;

/** Traînées lumineuses des feux arrière pendant la nitro (rubans additifs). */
export class Trails {
  readonly mesh: Mesh;
  private pos: Float32Array;
  private col: Float32Array;
  private hist: Float32Array; // [trail][i] -> x,z
  private intensity = 0;
  private filled = 0;

  constructor() {
    const verts = 2 * N * 2; // 2 traînées × N points × 2 sommets
    this.pos = new Float32Array(verts * 3);
    this.col = new Float32Array(verts * 3);
    this.hist = new Float32Array(2 * N * 2);
    const idx: number[] = [];
    for (let t = 0; t < 2; t++) {
      const base = t * N * 2;
      for (let i = 0; i < N - 1; i++) {
        const a = base + i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new BufferGeometry();
    const pa = new BufferAttribute(this.pos, 3).setUsage(DynamicDrawUsage);
    const ca = new BufferAttribute(this.col, 3).setUsage(DynamicDrawUsage);
    g.setAttribute('position', pa);
    g.setAttribute('color', ca);
    g.setIndex(idx);
    this.mesh = new Mesh(
      g,
      new MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    this.mesh.frustumCulled = false;
  }

  reset(): void {
    this.filled = 0;
    this.intensity = 0;
    this.mesh.visible = false;
  }

  update(dt: number, x: number, z: number, h: number, active: boolean): void {
    this.intensity += ((active ? 1 : 0) - this.intensity) * Math.min(1, dt * 6);
    this.mesh.visible = this.intensity > 0.02;
    const fx = Math.sin(h), fz = Math.cos(h);
    const rx = -fz, rz = fx;
    for (let t = 0; t < 2; t++) {
      const side = t === 0 ? -0.58 : 0.58;
      const off = t * N * 2;
      this.hist.copyWithin(off + 2, off, off + N * 2 - 2); // décale l'historique
      this.hist[off] = x - fx * 2.15 + rx * side;
      this.hist[off + 1] = z - fz * 2.15 + rz * side;
    }
    this.filled = Math.min(N, this.filled + 1);
    if (!this.mesh.visible) return;
    for (let t = 0; t < 2; t++) {
      const off = t * N * 2;
      for (let i = 0; i < N; i++) {
        const j = Math.min(i, this.filled - 1);
        const hx = this.hist[off + j * 2], hz = this.hist[off + j * 2 + 1];
        const v = (off + i * 2) * 3;
        const w = 0.12 * (1 - i / N);
        this.pos[v] = hx; this.pos[v + 1] = 0.68 - w; this.pos[v + 2] = hz;
        this.pos[v + 3] = hx; this.pos[v + 4] = 0.68 + w; this.pos[v + 5] = hz;
        const a = this.intensity * (1 - i / (N - 1));
        for (const k of [v, v + 3]) {
          this.col[k] = a; this.col[k + 1] = a * 0.25; this.col[k + 2] = a * 0.9;
        }
      }
    }
    const g = this.mesh.geometry;
    g.getAttribute('position').needsUpdate = true;
    g.getAttribute('color').needsUpdate = true;
  }
}
