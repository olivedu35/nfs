import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Euler,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BINS } from '../config';
import { tint } from './CarModel';
import { mulberry32 } from './rng';
import { Track, TrackSample } from './Track';

const GRAVITY = 22;
const RADIUS = 0.42;
const HALF_H = 0.55;
const BIN_COLORS = [0x2f8f4e, 0x2d6fb0, 0x6b6f78, 0xd8a72a, 0x9a3b3b];
const TRASH_COLORS = [0xe8e2c8, 0x8a6a3a, 0x4fbf5a, 0xd03a3a, 0xf0f0f0, 0x3a7bd5];
const DEBRIS = 60;

interface Bin {
  hx: number;
  hz: number;
  hh: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  rz: number;
  wx: number;
  wz: number;
  ry: number;
  knocked: boolean;
  resting: boolean;
  timer: number;
}

interface Debris {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number;
  spin: number;
}

/** Poubelles renversables : purement pour le fun (et le score). 2 draw calls. */
export class Bins {
  readonly mesh: InstancedMesh;
  readonly debrisMesh: InstancedMesh;
  private bins: Bin[] = [];
  private debris: Debris[] = [];
  private nextDebris = 0;
  private dirty = true;
  private m = new Matrix4();
  private q = new Quaternion();
  private e = new Euler();
  private p = new Vector3();
  private s = new Vector3(1, 1, 1);

  constructor(track: Track) {
    const rand = mulberry32(4242);
    const tmp: TrackSample = { x: 0, z: 0, tx: 0, tz: 1, rx: -1, rz: 0 };
    // pas de poubelles sur la grille de départ
    for (let s = 60; s < track.length - 40; s += BINS.spacing * (0.7 + rand() * 0.6)) {
      const side = rand() < 0.5 ? -1 : 1;
      const lateral = side * (BINS.lateralMin + rand() * (BINS.lateralMax - BINS.lateralMin));
      const group = 1 + Math.floor(rand() * rand() * 4); // souvent 1, parfois 2-4 → combos
      for (let k = 0; k < group; k++) {
        track.sampleAt(s + k * 1.3, tmp);
        const x = tmp.x + tmp.rx * lateral;
        const z = tmp.z + tmp.rz * lateral;
        this.bins.push({
          hx: x, hz: z, hh: rand() * Math.PI * 2,
          x, y: HALF_H, z, vx: 0, vy: 0, vz: 0, rx: 0, rz: 0, wx: 0, wz: 0, ry: 0,
          knocked: false, resting: true, timer: 0,
        });
      }
    }

    const geo = mergeGeometries([
      tint(new CylinderGeometry(RADIUS, RADIUS * 0.85, HALF_H * 2 - 0.1, 9).translate(0, -0.05, 0), 0xffffff),
      tint(new CylinderGeometry(RADIUS * 1.1, RADIUS * 1.1, 0.1, 9).translate(0, HALF_H - 0.05, 0), [0.55, 0.55, 0.55]),
      tint(new BoxGeometry(0.3, 0.06, 0.1).translate(0, HALF_H + 0.03, 0), [0.3, 0.3, 0.3]),
    ]);
    this.mesh = new InstancedMesh(geo, new MeshLambertMaterial({ vertexColors: true }), this.bins.length);
    this.mesh.frustumCulled = false;
    const c = new Color();
    this.bins.forEach((b, i) => {
      b.ry = b.hh;
      this.mesh.setColorAt(i, c.setHex(BIN_COLORS[Math.floor(rand() * BIN_COLORS.length)]));
    });

    this.debrisMesh = new InstancedMesh(new BoxGeometry(0.22, 0.12, 0.18), new MeshLambertMaterial(), DEBRIS);
    this.debrisMesh.frustumCulled = false;
    for (let i = 0; i < DEBRIS; i++) {
      this.debris.push({ x: 0, y: -10, z: 0, vx: 0, vy: 0, vz: 0, life: 0, spin: 0 });
      this.debrisMesh.setColorAt(i, c.setHex(TRASH_COLORS[i % TRASH_COLORS.length]));
    }
    this.reset();
  }

  reset(): void {
    for (const b of this.bins) this.restore(b);
    for (const d of this.debris) d.life = 0;
    this.dirty = true;
  }

  private restore(b: Bin): void {
    b.x = b.hx; b.z = b.hz; b.y = HALF_H;
    b.vx = b.vy = b.vz = 0;
    b.rx = b.rz = b.wx = b.wz = 0;
    b.ry = b.hh;
    b.knocked = false;
    b.resting = true;
  }

  /**
   * Teste une voiture (boîte orientée) contre les poubelles debout.
   * Renvoie le nombre de poubelles percutées à ce pas.
   */
  collide(x: number, z: number, h: number, vx: number, vz: number, reach = 0): number {
    const fx = Math.sin(h), fz = Math.cos(h);
    const rx = -fz, rz = fx;
    const speed = Math.hypot(vx, vz);
    let hits = 0;
    for (const b of this.bins) {
      if (b.knocked) continue;
      const dx = b.x - x, dz = b.z - z;
      const far = 3.5 + reach;
      if (dx * dx + dz * dz > far * far) continue;
      const lf = dx * fx + dz * fz;
      const ll = dx * rx + dz * rz;
      if (Math.abs(lf) > 2.1 + RADIUS + reach || Math.abs(ll) > 0.95 + RADIUS + reach) continue;
      if (speed < 2) continue; // il faut un minimum d'élan
      hits++;
      b.knocked = true;
      b.resting = false;
      b.timer = 0;
      const push = Math.sign(ll) || 1;
      b.vx = vx * 1.15 + rx * push * (2 + speed * 0.08);
      b.vz = vz * 1.15 + rz * push * (2 + speed * 0.08);
      b.vy = 4 + speed * 0.14 + Math.random() * 2;
      b.wx = (Math.random() - 0.5) * 18;
      b.wz = (Math.random() - 0.5) * 18;
      this.spawnDebris(b, vx, vz, speed);
    }
    return hits;
  }

  private spawnDebris(b: Bin, vx: number, vz: number, speed: number): void {
    for (let k = 0; k < 7; k++) {
      const d = this.debris[this.nextDebris];
      this.nextDebris = (this.nextDebris + 1) % DEBRIS;
      d.x = b.x; d.y = HALF_H * 1.6; d.z = b.z;
      const a = Math.random() * Math.PI * 2;
      const r = 2 + Math.random() * (3 + speed * 0.08);
      d.vx = vx * 0.7 + Math.cos(a) * r;
      d.vz = vz * 0.7 + Math.sin(a) * r;
      d.vy = 3 + Math.random() * 6;
      d.life = 1.6 + Math.random() * 0.8;
      d.spin = Math.random() * 10;
    }
  }

  update(dt: number, px: number, pz: number): void {
    for (const b of this.bins) {
      if (!b.knocked) continue;
      b.timer += dt;
      if (!b.resting) {
        this.dirty = true;
        b.vy -= GRAVITY * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.z += b.vz * dt;
        b.rx += b.wx * dt;
        b.rz += b.wz * dt;
        // hauteur du point le plus bas selon l'inclinaison
        const c = Math.abs(Math.cos(b.rz) * Math.cos(b.rx));
        const ground = HALF_H * c + RADIUS * Math.sqrt(Math.max(0, 1 - c * c));
        if (b.y < ground) {
          b.y = ground;
          if (b.vy < 0) b.vy = -b.vy * 0.35;
          b.vx *= 0.75; b.vz *= 0.75;
          b.wx *= 0.7; b.wz *= 0.7;
          if (Math.abs(b.vy) < 1.2 && Math.hypot(b.vx, b.vz) < 1) b.resting = true;
        }
      }
      // réapparition une fois hors de vue
      if (b.timer > BINS.respawnTime) {
        const dx = b.hx - px, dz = b.hz - pz;
        const ex = b.x - px, ez = b.z - pz;
        if (dx * dx + dz * dz > 80 * 80 && ex * ex + ez * ez > 80 * 80) {
          this.restore(b);
          this.dirty = true;
        }
      }
    }
    for (const d of this.debris) {
      if (d.life <= 0) continue;
      this.dirty = true;
      d.life -= dt;
      d.vy -= GRAVITY * dt;
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      if (d.y < 0.06) { d.y = 0.06; d.vy = -d.vy * 0.3; d.vx *= 0.6; d.vz *= 0.6; d.spin *= 0.6; }
    }
  }

  sync(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.bins.forEach((b, i) => {
      this.e.set(b.rx, b.ry, b.rz);
      this.q.setFromEuler(this.e);
      this.p.set(b.x, b.y, b.z);
      this.s.set(1, 1, 1);
      this.mesh.setMatrixAt(i, this.m.compose(this.p, this.q, this.s));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.debris.forEach((d, i) => {
      const alive = d.life > 0;
      const k = alive ? Math.min(1, d.life * 2) : 0;
      this.e.set(d.spin * d.life, d.spin * 0.7 * d.life, 0);
      this.q.setFromEuler(this.e);
      this.p.set(d.x, alive ? d.y : -10, d.z);
      this.s.set(k, k, k);
      this.debrisMesh.setMatrixAt(i, this.m.compose(this.p, this.q, this.s));
    });
    this.debrisMesh.instanceMatrix.needsUpdate = true;
  }
}
