import { Track, TrackSample } from './Track';

const tmp: TrackSample = { x: 0, z: 0, tx: 0, tz: 1, rx: -1, rz: 0 };

/**
 * Véhicule cinématique qui suit la spline : abscisse s + décalage latéral (lane).
 * Robuste, peu coûteux et sans risque de sortie de piste — idéal pour IA, trafic et police.
 */
export class RailBody {
  s = 0;
  /** tours franchis (la grille démarre derrière la ligne : -1) */
  lap = 0;
  speed = 0;
  lane = 0;
  laneVel = 0;
  x = 0;
  z = 0;
  h = 0;
  vx = 0;
  vz = 0;

  /** modifiable : un même véhicule est réutilisé d'un circuit à l'autre */
  constructor(public track: Track) {}

  get progress(): number {
    return this.lap * this.track.length + this.s;
  }

  setAt(s: number, lane: number, lap: number): void {
    this.s = this.track.wrapS(s);
    this.lane = lane;
    this.lap = lap;
    this.laneVel = 0;
    this.updatePose(0);
  }

  /** Avance de ds le long du tracé. Renvoie +1/-1 si la ligne a été franchie. */
  advance(ds: number): number {
    const L = this.track.length;
    let ns = this.s + ds;
    let crossed = 0;
    if (ns >= L) { ns -= L; this.lap++; crossed = 1; }
    else if (ns < 0) { ns += L; this.lap--; crossed = -1; }
    this.s = ns;
    return crossed;
  }

  updatePose(dt: number): void {
    const p = this.track.sampleAt(this.s, tmp);
    const nx = p.x + p.rx * this.lane;
    const nz = p.z + p.rz * this.lane;
    if (dt > 0) {
      this.vx = (nx - this.x) / dt;
      this.vz = (nz - this.z) / dt;
    } else {
      this.vx = p.tx * this.speed;
      this.vz = p.tz * this.speed;
    }
    this.x = nx;
    this.z = nz;
    // cap = tangente + légère orientation selon le changement de file
    const base = Math.atan2(p.tx, p.tz);
    const slip = Math.atan2(this.laneVel, Math.max(this.speed, 5));
    this.h = base - slip;
  }
}
