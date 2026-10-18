import { Color, Object3D } from 'three';
import { TRAFFIC } from '../config';
import { createCarInstances } from './CarModel';
import { RailBody } from './Rail';
import { clamp } from './rng';
import { Track } from './Track';

export class TrafficCar extends RailBody {
  baseSpeed = 15;
  /** évite de compter plusieurs « near miss » sur le même dépassement */
  nearMissArmed = true;
  recover = 0;
}

/** Voitures civiles lentes, rendues en InstancedMesh (3 draw calls). */
export class Traffic {
  readonly cars: TrafficCar[] = [];
  readonly meshes = createCarInstances(TRAFFIC.count);
  private dummy = new Object3D();

  setTrack(track: Track): void {
    this.track = track;
    for (const c of this.cars) c.track = track;
  }

  constructor(private track: Track) {
    const tmp = new Color();
    for (let i = 0; i < TRAFFIC.count; i++) {
      this.cars.push(new TrafficCar(track));
      tmp.setHex(TRAFFIC.colors[i % TRAFFIC.colors.length]);
      this.meshes.body.setColorAt(i, tmp);
    }
  }

  reset(): void {
    const L = this.track.length;
    // répartis sur le circuit, en évitant la grille de départ
    const start = 80, end = L - 90;
    this.cars.forEach((c, i) => {
      // une file dans le sens de la course, l'autre à contresens (vraie circulation à double sens)
      const laneIdx = i % TRAFFIC.lanes.length;
      c.dir = laneIdx === 0 ? -1 : 1;
      const lane = TRAFFIC.lanes[laneIdx] + (Math.random() - 0.5);
      c.baseSpeed = TRAFFIC.minSpeed + Math.random() * (TRAFFIC.maxSpeed - TRAFFIC.minSpeed);
      c.speed = c.baseSpeed;
      c.recover = 0;
      c.nearMissArmed = true;
      const s = start + ((end - start) * (i + 0.5)) / this.cars.length;
      c.setAt(s, lane, 0);
    });
  }

  update(dt: number): void {
    for (const c of this.cars) {
      if (c.recover > 0) c.recover -= dt;
      c.speed += (c.baseSpeed - c.speed) * Math.min(1, dt * 0.8);
      c.advance(c.dir * c.speed * dt);
      c.updatePose(dt);
      c.laneVel *= Math.exp(-4 * dt);
    }
  }

  sync(): void {
    const d = this.dummy;
    this.cars.forEach((c, i) => {
      d.position.set(c.x, c.y, c.z);
      d.rotation.set(clamp(c.vy * 0.025, -0.35, 0.35), c.h, 0);
      d.updateMatrix();
      this.meshes.body.setMatrixAt(i, d.matrix);
      this.meshes.lights.setMatrixAt(i, d.matrix);
      this.meshes.beam.setMatrixAt(i, d.matrix);
    });
    this.meshes.body.instanceMatrix.needsUpdate = true;
    this.meshes.lights.instanceMatrix.needsUpdate = true;
    this.meshes.beam.instanceMatrix.needsUpdate = true;
  }
}
