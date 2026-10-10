import { PerspectiveCamera, Vector3 } from 'three';
import { CAMERA, NITRO } from '../config';
import { clamp } from './rng';

/** Caméra de poursuite : suivi amorti, FOV dynamique selon la vitesse/nitro, secousses. */
export class ChaseCamera {
  readonly cam: PerspectiveCamera;
  private pos = new Vector3();
  private look = new Vector3();
  private trauma = 0;
  private fov = CAMERA.fov;
  private yaw = 0;

  constructor(aspect: number) {
    this.cam = new PerspectiveCamera(CAMERA.fov, aspect, 0.3, 600);
  }

  shake(amount: number): void {
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  snap(x: number, z: number, h: number): void {
    this.yaw = h;
    this.pos.set(x - Math.sin(h) * CAMERA.distance, CAMERA.height, z - Math.cos(h) * CAMERA.distance);
    this.look.set(x, 1, z);
    this.cam.position.copy(this.pos);
    this.cam.lookAt(this.look);
  }

  update(dt: number, x: number, z: number, h: number, speedRatio: number, nitro: boolean): void {
    // le cap de la caméra suit celui de la voiture avec retard (on voit la glisse)
    let d = h - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, dt * 5);

    const dist = CAMERA.distance + speedRatio * 1.5 + (nitro ? 1 : 0);
    const tx = x - Math.sin(this.yaw) * dist;
    const tz = z - Math.cos(this.yaw) * dist;
    const k = Math.min(1, dt * CAMERA.lerp * 2);
    this.pos.x += (tx - this.pos.x) * k;
    this.pos.z += (tz - this.pos.z) * k;
    this.pos.y += (CAMERA.height - speedRatio * 0.4 - this.pos.y) * k;
    this.look.set(x + Math.sin(h) * CAMERA.lookAhead, 1, z + Math.cos(h) * CAMERA.lookAhead);

    const targetFov = CAMERA.fov + speedRatio * CAMERA.fovSpeed + (nitro ? NITRO.fovBoost : 0);
    this.fov += (targetFov - this.fov) * Math.min(1, dt * 4);
    this.cam.fov = this.fov;
    this.cam.updateProjectionMatrix();

    this.cam.position.copy(this.pos);
    this.trauma = Math.max(0, this.trauma - CAMERA.shakeDecay * dt);
    const s = this.trauma * this.trauma;
    // vibration légère à très haute vitesse
    const hum = nitro ? 0.04 : speedRatio > 0.85 ? 0.015 : 0;
    this.cam.position.x += (Math.random() - 0.5) * (s * 0.9 + hum);
    this.cam.position.y += (Math.random() - 0.5) * (s * 0.6 + hum);
    this.cam.lookAt(this.look);
  }

  resize(aspect: number): void {
    this.cam.aspect = aspect;
    this.cam.updateProjectionMatrix();
  }
}
