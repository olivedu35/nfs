import { Group } from 'three';
import { CarSpec, NITRO, PHYSICS, TRACK } from '../config';
import { clamp } from './rng';
import { Projection, Track } from './Track';
import { createCarMesh } from './CarModel';

export interface DriveInput {
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1 (gauche) .. 1 (droite)
  nitro: boolean;
  /** true pour le gyroscope : la direction est déjà analogique */
  analog: boolean;
  /** freinage seul, sans enclencher la marche arrière (fin de course) */
  noReverse?: boolean;
}

/**
 * Physique arcade du joueur.
 * Repère : cap h, avant = (sin h, cos h), droite = (-cos h, sin h).
 */
export class Car {
  x = 0;
  z = 0;
  h = 0;
  vx = 0;
  vz = 0;
  steer = 0;
  nitro = NITRO.start;
  nitroActive = false;
  drifting = false;
  /** intensité du dernier choc contre un mur (lue puis remise à 0 par le jeu) */
  wallImpact = 0;
  readonly proj: Projection = { index: 0, s: 0, lateral: 0 };
  readonly mesh: Group;

  constructor(public spec: CarSpec) {
    this.mesh = createCarMesh(spec.color);
  }

  get speed(): number {
    return Math.hypot(this.vx, this.vz);
  }

  /** vitesse dans l'axe de la voiture (négative en marche arrière) */
  get forwardSpeed(): number {
    return this.vx * Math.sin(this.h) + this.vz * Math.cos(this.h);
  }

  place(x: number, z: number, h: number, track: Track): void {
    this.x = x;
    this.z = z;
    this.h = h;
    this.vx = this.vz = 0;
    this.steer = 0;
    this.nitro = NITRO.start;
    this.nitroActive = false;
    this.drifting = false;
    track.project(x, z, -1, this.proj);
  }

  step(dt: number, input: DriveInput, track: Track): void {
    const spec = this.spec;
    let fx = Math.sin(this.h), fz = Math.cos(this.h);
    let rx = -fz, rz = fx;
    let fwd = this.vx * fx + this.vz * fz;
    let lat = this.vx * rx + this.vz * rz;

    // Direction : lissage pour les boutons, direct pour le gyroscope
    if (input.analog) {
      this.steer += (input.steer - this.steer) * Math.min(1, dt * 14);
    } else {
      const target = input.steer;
      const returning = target === 0 || Math.sign(target) !== Math.sign(this.steer);
      const rate = (returning ? PHYSICS.steerReturn : PHYSICS.steerRate) * dt;
      this.steer += clamp(target - this.steer, -rate, rate);
    }

    // Nitro
    this.nitroActive = input.nitro && this.nitro > 0.01 && fwd > 5;
    if (this.nitroActive) this.nitro = Math.max(0, this.nitro - NITRO.drain * dt);
    const maxV = spec.maxSpeed * (this.nitroActive ? NITRO.boostSpeed : 1);

    // Drift : frein + braquage à haute vitesse = adhérence réduite
    const driftMode =
      input.brake > 0.5 && Math.abs(this.steer) > 0.45 && fwd > PHYSICS.driftMinSpeed;

    // Longitudinal
    let a = 0;
    if (input.throttle > 0 && fwd > -1) {
      const r = clamp(fwd / maxV, 0, 1);
      a += spec.accel * input.throttle * (1 - r * r * r);
      if (this.nitroActive) a += NITRO.boostAccel;
    }
    if (input.brake > 0) {
      if (fwd > 0.5) a -= PHYSICS.brakeDecel * input.brake * (driftMode ? 0.25 : 1);
      else if (input.throttle === 0 && !input.noReverse && fwd > -PHYSICS.reverseMax) a -= PHYSICS.reverseAccel * input.brake;
    }
    a -= PHYSICS.drag * fwd;
    if (input.throttle === 0 && input.brake === 0) {
      a -= PHYSICS.rolling * Math.sign(fwd);
      if (Math.abs(fwd) < PHYSICS.rolling * dt * 2) {
        fwd = 0;
        a = 0;
      }
    }
    fwd += a * dt;
    if (fwd > maxV) fwd -= (fwd - maxV) * Math.min(1, 1.5 * dt);

    // Lacet
    const sp = Math.abs(fwd);
    const speedFactor = clamp(sp / 10, 0, 1) * (1 - 0.3 * clamp(sp / spec.maxSpeed, 0, 1));
    let yaw = -this.steer * spec.handling * speedFactor * Math.sign(fwd || 1);
    if (driftMode) yaw *= 1.35;
    this.vx = fx * fwd + rx * lat;
    this.vz = fz * fwd + rz * lat;
    this.h += yaw * dt;

    // Re-projection dans le nouveau repère : la vitesse latérale qui apparaît = glisse
    fx = Math.sin(this.h); fz = Math.cos(this.h);
    rx = -fz; rz = fx;
    fwd = this.vx * fx + this.vz * fz;
    lat = this.vx * rx + this.vz * rz;
    const grip = driftMode ? PHYSICS.driftGrip : spec.grip;
    lat *= Math.exp(-grip * dt);
    this.drifting = Math.abs(lat) > PHYSICS.driftThreshold && fwd > PHYSICS.driftMinSpeed;
    if (this.drifting && input.throttle > 0) {
      // en drift on garde de l'élan : le grip latéral n'est pas totalement perdu
      fwd += Math.abs(lat) * (1 - Math.exp(-grip * dt)) * 0.35;
    }
    this.vx = fx * fwd + rx * lat;
    this.vz = fz * fwd + rz * lat;

    this.x += this.vx * dt;
    this.z += this.vz * dt;

    this.collideWalls(track);
  }

  private collideWalls(track: Track): void {
    const p = track.project(this.x, this.z, this.proj.index, this.proj);
    const limit = TRACK.halfWidth + 0.6;
    const over = Math.abs(p.lateral) - limit;
    if (over <= 0) return;
    const side = Math.sign(p.lateral);
    const i = p.index;
    const rx = -track.tz[i], rz = track.tx[i];
    this.x -= rx * over * side;
    this.z -= rz * over * side;
    const vOut = (this.vx * rx + this.vz * rz) * side;
    if (vOut > 0) {
      this.vx -= rx * vOut * side * 1.3;
      this.vz -= rz * vOut * side * 1.3;
      // perte proportionnelle à la violence du choc ; un simple frottement ne coûte presque rien
      const loss = 1 - clamp(vOut / 30, 0, 1 - PHYSICS.wallSlow) - 0.004;
      this.vx *= loss;
      this.vz *= loss;
      this.wallImpact = Math.max(this.wallImpact, vOut);
      // on réaligne légèrement le cap sur la route
      const th = Math.atan2(track.tx[i], track.tz[i]);
      let d = th - this.h;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) < Math.PI / 2) this.h += d * 0.25;
    }
  }

  syncMesh(): void {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.set(0, this.h, 0);
    // petit roulis visuel
    this.mesh.rotation.z = -this.steer * clamp(this.speed / 60, 0, 1) * 0.05;
  }
}
