import { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshToonMaterial } from 'three';
import { POLICE, TRACK } from '../config';
import { createCarMesh, createSirenLights } from './CarModel';
import { RailBody } from './Rail';
import { clamp, damp } from './rng';
import { Track } from './Track';

export type PoliceEvent = 'none' | 'spawn' | 'busted' | 'escaped' | 'gone';

/**
 * Système de poursuite : la « heat » monte quand le joueur roule au-dessus du seuil.
 * À 100 %, une voiture de police apparaît derrière lui et tente de le bloquer.
 */
export class Police extends RailBody {
  readonly mesh: Group;
  private red: MeshBasicMaterial;
  private blue: MeshBasicMaterial;
  heat = 0;
  active = false;
  bustTimer = 0;
  escapeTimer = 0;
  /** coups reçus du joueur (≥ 50 km/h) */
  hits = 0;
  wrecked = false;
  private hitCooldown = 0;
  private wreckTimer = 0;
  private blink = 0;
  private bodyMat: MeshToonMaterial;
  private smoke: Mesh[] = [];

  constructor(track: Track) {
    super(track);
    this.mesh = createCarMesh('muscle', 0xf2f2f2);
    const siren = createSirenLights();
    this.red = siren.red;
    this.blue = siren.blue;
    this.mesh.add(siren.group);
    // children[0] = silhouette d'outline, children[1] = carrosserie peinte
    this.bodyMat = (this.mesh.children[1] as Mesh).material as MeshToonMaterial;
    // fumée de l'épave : quelques cubes gris qui montent en boucle
    const puffGeo = new BoxGeometry(0.7, 0.7, 0.7);
    const puffMat = new MeshBasicMaterial({ color: 0x555560, transparent: true, opacity: 0.55, depthWrite: false });
    for (let i = 0; i < 6; i++) {
      const p = new Mesh(puffGeo, puffMat);
      p.visible = false;
      this.smoke.push(p);
      this.mesh.add(p);
    }
    this.mesh.visible = false;
  }

  reset(): void {
    this.heat = 0;
    this.active = false;
    this.bustTimer = 0;
    this.escapeTimer = 0;
    this.hits = 0;
    this.wrecked = false;
    this.hitCooldown = 0;
    this.wreckTimer = 0;
    this.bodyMat.color.setHex(0xf2f2f2);
    for (const p of this.smoke) p.visible = false;
    this.mesh.visible = false;
  }

  /**
   * Coup porté par le joueur. Renvoie 'wreck' quand la voiture est détruite,
   * 'hit' pour un coup compté, 'none' sinon (trop lent, déjà KO, ou trop rapproché).
   */
  ram(playerSpeed: number): 'none' | 'hit' | 'wreck' {
    if (!this.active || this.wrecked || this.hitCooldown > 0 || playerSpeed < POLICE.ramSpeed) return 'none';
    this.hits++;
    this.hitCooldown = POLICE.ramCooldown;
    if (this.hits < POLICE.ramHits) return 'hit';
    this.wrecked = true;
    this.wreckTimer = 0;
    this.bustTimer = 0;
    this.heat = 0;
    this.bodyMat.color.setHex(0x3a3a40);
    this.red.color.setHex(0x110000);
    this.blue.color.setHex(0x000011);
    this.smoke.forEach((p) => (p.visible = true));
    return 'wreck';
  }

  /** Distance (le long du tracé) entre la police et le joueur, >0 si le joueur est devant. */
  gapTo(playerProgress: number): number {
    return playerProgress - this.progress;
  }

  update(
    dt: number,
    player: { progress: number; s: number; lateral: number; speed: number; x: number; z: number; lap: number },
  ): PoliceEvent {
    if (this.hitCooldown > 0) this.hitCooldown -= dt;
    if (this.active && this.wrecked) {
      // épave : elle s'arrête en glissant puis disparaît une fois hors de vue
      this.wreckTimer += dt;
      this.speed = Math.max(0, this.speed - 30 * dt);
      this.advance(this.speed * dt);
      this.updatePose(dt);
      const d = Math.hypot(player.x - this.x, player.z - this.z);
      if (this.wreckTimer > POLICE.wreckDespawn || (this.wreckTimer > 4 && d > 70)) {
        this.reset();
        return 'gone';
      }
      return 'none';
    }
    if (!this.active) {
      if (player.speed > POLICE.heatSpeed) this.heat += POLICE.heatRise * dt;
      else this.heat -= POLICE.heatDecay * dt;
      this.heat = clamp(this.heat, 0, 1);
      if (this.heat >= 1) {
        this.active = true;
        this.bustTimer = 0;
        this.escapeTimer = 0;
        this.setAt(player.s - POLICE.spawnBehind, player.lateral, player.lap);
        if (player.s - POLICE.spawnBehind < 0) this.lap = player.lap - 1;
        this.speed = player.speed;
        this.mesh.visible = true;
        return 'spawn';
      }
      return 'none';
    }

    // Poursuite en 2 temps : dépasser par le côté, puis se rabattre devant et ralentir pour coincer.
    const gap = this.gapTo(player.progress); // > 0 : le joueur est devant
    const lim = TRACK.halfWidth - 1.2;
    const err = gap + 6; // la police veut être 6 m devant le joueur
    let target: number;
    let laneTarget: number;
    if (gap > 3) {
      // derrière : on remonte en décalé pour ne pas percuter le joueur par l'arrière
      target = gap > 25 ? POLICE.speed : player.speed + 4 + gap * 0.4;
      const side = player.lateral > 0 ? -1 : 1;
      laneTarget = gap < 20 ? player.lateral + side * 3.6 : player.lateral;
    } else {
      // à hauteur ou devant : on se met dans la file du joueur et on freine
      laneTarget = player.lateral;
      target = player.speed + err * 1.5;
      if (gap < -2 && Math.abs(this.lane - player.lateral) < 2.2) target = Math.min(target, player.speed * 0.8);
    }
    target = clamp(target, -12, POLICE.speed);
    laneTarget = clamp(laneTarget, -lim, lim);
    const a = POLICE.accel;
    this.speed += clamp(target - this.speed, -a * 1.5 * dt, a * dt);

    const prev = this.lane;
    // la police change de file plus lentement que le joueur : on peut l'esquiver
    const maxLat = (gap > 15 ? 6 : 3.4) * dt;
    this.lane += clamp(damp(this.lane, laneTarget, 2.5, dt) - this.lane, -maxLat, maxLat);
    this.laneVel = (this.lane - prev) / Math.max(dt, 1e-4);

    this.advance(this.speed * dt);
    this.updatePose(dt);

    // Blocage
    const d = Math.hypot(player.x - this.x, player.z - this.z);
    if (d < POLICE.bustDist && player.speed < POLICE.bustSpeed) this.bustTimer += dt;
    else this.bustTimer = Math.max(0, this.bustTimer - dt * 0.5);
    if (this.bustTimer >= POLICE.bustTime) return 'busted';

    // Fuite
    if (gap > POLICE.escapeDist) this.escapeTimer += dt;
    else this.escapeTimer = 0;
    if (this.escapeTimer >= POLICE.escapeTime) {
      this.active = false;
      this.heat = 0;
      this.mesh.visible = false;
      return 'escaped';
    }
    return 'none';
  }

  nudge(dLane: number, dSpeed: number): void {
    this.lane = clamp(this.lane + dLane, -TRACK.halfWidth + 1.2, TRACK.halfWidth - 1.2);
    this.speed = Math.max(0, this.speed + dSpeed);
  }

  syncMesh(dt: number): void {
    if (!this.active) return;
    this.blink += dt;
    if (this.wrecked) {
      this.mesh.position.set(this.x, this.y, this.z);
      this.mesh.rotation.set(0, this.h + Math.min(1, this.wreckTimer) * 0.6, 0.12);
      this.smoke.forEach((p, i) => {
        const t = (this.blink * 0.8 + i / this.smoke.length) % 1;
        p.position.set(Math.sin(i * 2.1) * 0.4, 1.2 + t * 4, 1.2 + Math.cos(i * 1.3) * 0.3);
        const s = 0.4 + t * 1.6;
        p.scale.set(s, s, s);
      });
      return;
    }
    const on = Math.floor(this.blink * 8) % 2 === 0;
    this.red.color.setHex(on ? 0xff1020 : 0x220000);
    this.blue.color.setHex(on ? 0x000822 : 0x1050ff);
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.y = this.h;
    this.mesh.rotation.x = clamp(this.vy * 0.025, -0.35, 0.35);
  }
}
