import { Group } from 'three';
import { AI, TRACK } from '../config';
import { createCarMesh } from './CarModel';
import { RailBody } from './Rail';
import { clamp, damp } from './rng';
import { Track } from './Track';

export interface Obstacle {
  s: number;
  lane: number;
  speed: number;
}

/** Pilote IA : suit la spline avec une file qui ondule, freine avant les virages, rubber banding léger. */
export class AIDriver extends RailBody {
  readonly mesh: Group;
  finished = false;
  finishTime = 0;
  private laneTarget = 0;
  private phase: number;
  private time = 0;
  private avoidTimer = 0;
  private avoidLane = 0;

  constructor(
    track: Track,
    public name: string,
    color: number,
    private skill: number,
  ) {
    super(track);
    this.mesh = createCarMesh(color);
    this.phase = Math.random() * 100;
  }

  reset(s: number, lane: number): void {
    this.setAt(s, lane, -1);
    this.speed = 0;
    this.finished = false;
    this.finishTime = 0;
    this.laneTarget = lane;
    this.time = 0;
    this.avoidTimer = 0;
  }

  /** Décalage latéral imposé par une collision. */
  nudge(dLane: number, dSpeed: number): void {
    this.lane = clamp(this.lane + dLane, -TRACK.halfWidth + 1.2, TRACK.halfWidth - 1.2);
    this.speed = Math.max(0, this.speed + dSpeed);
  }

  update(dt: number, playerProgress: number, obstacles: Obstacle[], racing: boolean): void {
    this.time += dt;
    const track = this.track;
    const L = track.length;

    // vitesse cible : virages + niveau + rubber banding
    const idx = track.indexAt(this.s + this.speed * 0.3);
    const gap = playerProgress - this.progress;
    const rubber = clamp(gap / AI.rubberDist, -1, 1) * AI.rubberBand;
    let target = Math.min(track.advisory[idx] * (0.92 + 0.08 * this.skill), AI.refMaxSpeed * this.skill);
    target *= 1 + rubber + Math.sin(this.time * 0.37 + this.phase) * 0.025;
    if (!racing) target = this.finished ? 18 : 0;

    // évitement : voiture lente devant dans la même file
    let blockedSpeed = Infinity;
    for (const o of obstacles) {
      if (o === this) continue;
      let ds = o.s - this.s;
      if (ds < -L / 2) ds += L;
      if (ds > L / 2) ds -= L;
      if (ds <= 0 || ds > 32) continue;
      if (Math.abs(o.lane - this.lane) > 2.6) continue;
      if (o.speed >= this.speed - 1) continue;
      // on déboîte du côté le plus libre
      const left = o.lane - 5.2, right = o.lane + 5.2;
      const lim = TRACK.halfWidth - 1.5;
      this.avoidLane = Math.abs(left) <= lim && (Math.abs(right) > lim || this.lane < o.lane) ? left : right;
      this.avoidTimer = 1.6;
      if (ds < 9) blockedSpeed = Math.min(blockedSpeed, o.speed);
    }
    if (blockedSpeed < target) target = blockedSpeed;

    const a = target > this.speed ? AI.accel * (1 - this.speed / (AI.refMaxSpeed * 1.2)) : -24;
    this.speed += clamp(target - this.speed, -Math.abs(a) * dt, Math.abs(a) * dt);
    this.speed = Math.max(0, this.speed);

    // file : ondulation + évitement
    if (this.avoidTimer > 0) {
      this.avoidTimer -= dt;
      this.laneTarget = this.avoidLane;
    } else {
      this.laneTarget = Math.sin(this.time * 0.21 + this.phase) * AI.laneWander;
    }
    this.laneTarget = clamp(this.laneTarget, -TRACK.halfWidth + 1.5, TRACK.halfWidth - 1.5);
    const prevLane = this.lane;
    this.lane = damp(this.lane, this.laneTarget, 1.6, dt);
    this.laneVel = dt > 0 ? (this.lane - prevLane) / dt : 0;

    this.advance(this.speed * dt);
    this.updatePose(dt);
  }

  syncMesh(): void {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.h;
  }
}
