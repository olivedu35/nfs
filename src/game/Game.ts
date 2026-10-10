import {
  AmbientLight,
  Color,
  DirectionalLight,
  Fog,
  Scene,
  WebGLRenderer,
} from 'three';
import { AI, BINS, CARS, CarSpec, DAMAGE, NITRO, PHYSICS, POLICE, RENDER, TRACK, TRAFFIC, UPGRADE_FX } from '../config';
import { Sound, vibrate } from '../audio/Sound';
import { GyroControls } from '../input/GyroControls';
import { TouchControls } from '../input/TouchControls';
import { Save, Settings } from '../storage/Save';
import { Hud } from '../ui/Hud';
import { MapDot, Minimap } from '../ui/Minimap';
import { AIDriver, Obstacle } from './AIDriver';
import { Bins } from './Bins';
import { ChaseCamera } from './Camera';
import { Car, DriveInput } from './Car';
import { Police } from './Police';
import { RailBody } from './Rail';
import { clamp } from './rng';
import { Track, TrackSample } from './Track';
import { TRACKS, TrackDef } from './tracks';
import { Traffic, TrafficCar } from './Traffic';
import { Trails } from './Trails';

export type GameState = 'idle' | 'countdown' | 'race' | 'finished' | 'busted';

export interface RaceResult {
  busted: boolean;
  position: number;
  time: number | null;
  bestLap: number | null;
  standings: { name: string; color: string; time: number | null; player: boolean; estimated: boolean }[];
  record: { race: boolean; lap: boolean };
  trackId: string;
  trackName: string;
  bins: number;
  score: number;
  scoreRecord: boolean;
  wrecks: number;
  wallet: number;
}

const COUNTDOWN = 3;
/** identifiant des bordures pour l'anti-doublon des dégâts */
const WALL = { wall: true };
const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

export class Game {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  track: Track;
  readonly camera: ChaseCamera;
  readonly hud: Hud;
  readonly minimap: Minimap;
  readonly touch: TouchControls;
  readonly gyro = new GyroControls();
  readonly sound = new Sound();
  player: Car;
  readonly ais: AIDriver[] = [];
  private traffic: Traffic;
  private police: Police;
  private trails = new Trails();
  private bins: Bins;
  private score = 0;
  private binCount = 0;
  private combo = 0;
  private lastBinHit = -99;
  private wrecks = 0;
  private banked = true;
  private nitroChargeMul = 1;
  private magnetReach = 0;
  private magnetPoints = 1;
  private magnetRadius = 0;
  private magnetPull = 0;
  private magnetToast = 0;
  /** accrochages depuis la dernière réapparition */
  private damage = 0;
  private damageCooldown = 0;
  /** > 0 : la voiture est une épave, elle réapparaît à 0 */
  private respawnTimer = 0;
  /** > 0 : invulnérable (traverse les véhicules) après une réapparition */
  private ghost = 0;
  private respawns = 0;
  /** dernier véhicule ayant causé un accrochage (un même véhicule ne compte qu'une fois par 1,5 s) */
  private lastDamageBody: object | null = null;
  private lastDamageTime = -99;

  state: GameState = 'idle';
  paused = false;
  private settings: Settings = Save.settings;
  private acc = 0;
  private last = 0;
  private countdown = 0;
  private raceTime = 0;
  private lap = -1;
  private prevS = 0;
  private lapStart = 0;
  private bestLap: number | null = null;
  private endTimer = 0;
  private wrongWay = 0;
  private finishPosition = 0;
  private finishTime: number | null = null;
  private lastNitro = false;
  private lastCount = 0;
  private dots: MapDot[] = [];
  private tmpSample: TrackSample = { x: 0, z: 0, tx: 0, tz: 1, rx: -1, rz: 0 };
  private obstacles: Obstacle[] = [];

  onEnd: ((r: RaceResult) => void) | null = null;

  constructor(canvas: HTMLCanvasElement, ui: HTMLElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, RENDER.maxDpr));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.track = new Track(TRACKS[0]);
    this.scene.background = new Color(RENDER.sky);
    this.scene.fog = new Fog(RENDER.sky, RENDER.fogNear, RENDER.fogFar);
    this.applyTheme();
    this.scene.add(new AmbientLight(0x8890c8, 1.1));
    const moon = new DirectionalLight(0xaab4ff, 1.2);
    moon.position.set(0.4, 0.8, 0.3);
    this.scene.add(moon);
    this.scene.add(this.track.group);

    this.camera = new ChaseCamera(window.innerWidth / window.innerHeight);

    this.player = new Car(CARS[0]);
    this.scene.add(this.player.mesh);
    for (let i = 0; i < AI.count; i++) {
      const ai = new AIDriver(this.track, AI.names[i], AI.colors[i], AI.skill[i]);
      this.ais.push(ai);
      this.scene.add(ai.mesh);
    }
    this.traffic = new Traffic(this.track);
    this.scene.add(this.traffic.meshes.body, this.traffic.meshes.lights, this.traffic.meshes.beam);
    this.police = new Police(this.track);
    this.scene.add(this.police.mesh);
    this.scene.add(this.trails.mesh);
    this.bins = new Bins(this.track);
    this.scene.add(this.bins.mesh, this.bins.debrisMesh);

    this.hud = new Hud(ui);
    this.minimap = new Minimap(this.hud.mapSlot, this.track);
    this.touch = new TouchControls(ui);
    this.touch.onPress = (id) => {
      if (id === 'nitro' && this.player.nitro > 0.05) vibrate(30);
    };
    this.hud.show(false);
    this.touch.show(false);

    window.addEventListener('resize', () => this.resize());
    this.setupGrid();
    this.camera.snap(this.player.x, this.player.z, this.player.h);
    // pré-compilation des shaders pour éviter un à-coup au départ
    this.renderer.compile(this.scene, this.camera.cam);
    this.last = performance.now();
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  get laps(): number {
    return this.track.def.laps;
  }

  private applyTheme(): void {
    const t = this.track.theme;
    (this.scene.background as Color).setHex(t.sky);
    const fog = this.scene.fog as Fog;
    fog.color.setHex(t.sky);
    fog.far = t.fogFar;
  }

  /** Change de circuit : le décor est reconstruit, les véhicules sont réutilisés. */
  loadTrack(def: TrackDef): void {
    if (this.track.def.id === def.id) return;
    this.scene.remove(this.track.group);
    this.track.dispose();
    this.track = new Track(def);
    this.scene.add(this.track.group);
    this.applyTheme();
    for (const ai of this.ais) ai.track = this.track;
    this.police.track = this.track;
    this.traffic.setTrack(this.track);
    this.scene.remove(this.bins.mesh, this.bins.debrisMesh);
    this.bins.dispose();
    this.bins = new Bins(this.track);
    this.scene.add(this.bins.mesh, this.bins.debrisMesh);
    this.minimap.setTrack(this.track);
    this.setupGrid();
    this.traffic.reset();
    this.renderer.compile(this.scene, this.camera.cam);
  }

  resize(): void {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, RENDER.maxDpr));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.camera.resize(window.innerWidth / window.innerHeight);
    this.touch.measure();
  }

  applySettings(s: Settings): void {
    this.settings = s;
    this.gyro.invert = s.gyroInvert;
    this.touch.setSteerVisible(s.control === 'buttons');
    this.sound.setEnabled(s.sound);
  }

  /** Grille : 2 lignes de 2, joueur en dernière position (à la NFS). */
  private setupGrid(): void {
    const slots: [number, number][] = [[-10, -3.5], [-10, 3.5], [-21, -3.5], [-21, 3.5]];
    const p = this.track.sampleAt(slots[3][0], this.tmpSample);
    const px = p.x + p.rx * slots[3][1], pz = p.z + p.rz * slots[3][1];
    this.player.place(px, pz, Math.atan2(p.tx, p.tz), this.track);
    this.ais.forEach((ai, i) => {
      ai.reset(slots[i][0], slots[i][1]);
      ai.syncMesh();
    });
    this.player.syncMesh();
  }

  startRace(carIndex: number, def: TrackDef, banner?: string): void {
    this.bankScore();
    this.loadTrack(def); // course précédente abandonnée : les points restent acquis
    const base = CARS[carIndex] ?? CARS[0];
    const lv = (id: Parameters<typeof Save.level>[0]): number => Save.level(id);
    const spec: CarSpec = {
      ...base,
      maxSpeed: base.maxSpeed * UPGRADE_FX.engine(lv('engine')),
      accel: base.accel * UPGRADE_FX.turbo(lv('turbo')),
      handling: base.handling * UPGRADE_FX.tires(lv('tires')),
      grip: base.grip * UPGRADE_FX.tires(lv('tires')),
    };
    this.nitroChargeMul = UPGRADE_FX.nitroCharge(lv('nitro'));
    this.magnetReach = UPGRADE_FX.magnetReach(lv('magnet'));
    this.magnetPoints = UPGRADE_FX.magnetPoints(lv('magnet'));
    this.magnetRadius = UPGRADE_FX.magnetRadius(lv('magnet'));
    this.magnetPull = UPGRADE_FX.magnetPull(lv('magnet'));
    this.scene.remove(this.player.mesh);
    this.player = new Car(spec);
    this.player.nitroDrainMul = UPGRADE_FX.nitroDrain(lv('nitro'));
    this.scene.add(this.player.mesh);
    this.applySettings(Save.settings);
    this.setupGrid();
    this.traffic.reset();
    this.police.reset();
    this.trails.reset();
    this.bins.reset();
    this.score = 0;
    this.binCount = 0;
    this.combo = 0;
    this.lastBinHit = -99;
    this.wrecks = 0;
    this.damage = 0;
    this.damageCooldown = 0;
    this.respawnTimer = 0;
    this.ghost = 0;
    this.respawns = 0;
    this.banked = false;
    this.lap = -1;
    this.prevS = this.player.proj.s;
    this.raceTime = 0;
    this.lapStart = 0;
    this.bestLap = null;
    this.endTimer = 0;
    this.wrongWay = 0;
    this.finishTime = null;
    this.finishPosition = 0;
    this.lastNitro = false;
    this.countdown = COUNTDOWN;
    this.lastCount = COUNTDOWN + 1;
    this.acc = 0;
    this.paused = false;
    this.state = 'countdown';
    this.camera.snap(this.player.x, this.player.z, this.player.h);
    this.hud.show(true);
    this.touch.show(true);
    this.hud.clearMessage();
    this.hud.toast(banner ?? `${def.name} · ${def.laps} TOURS`, '#2de2ff', 3);
  }

  /** Verse le score de la course dans le portefeuille (une seule fois par course). */
  private bankScore(): void {
    if (this.banked) return;
    this.banked = true;
    Save.deposit(this.score);
  }

  quitToTitle(): void {
    this.bankScore();
    this.state = 'idle';
    this.paused = false;
    this.hud.show(false);
    this.touch.show(false);
    this.sound.engine(0, 0, false);
    this.sound.siren(false, 0, 0);
    this.police.reset();
    this.setupGrid();
    this.traffic.reset();
  }

  setPaused(p: boolean): void {
    if (this.state === 'idle') return;
    this.paused = p;
    if (p) {
      this.touch.clear();
      this.sound.suspend();
    } else {
      this.sound.resume();
      this.last = performance.now();
      this.acc = 0;
    }
  }

  private readInput(): DriveInput {
    const t = this.touch;
    const gyro = this.settings.control === 'gyro';
    return {
      throttle: t.is('gas') ? 1 : 0,
      brake: t.is('brake') ? 1 : 0,
      steer: gyro ? this.gyro.steer : t.steer,
      nitro: t.is('nitro'),
      analog: gyro,
    };
  }

  private frame(now: number): void {
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > PHYSICS.maxFrame) dt = PHYSICS.maxFrame;
    if (dt < 0) dt = 0;

    if (this.state === 'idle') {
      // écran titre : la caméra tourne lentement autour de la grille
      const t = now / 1000;
      const p = this.player;
      const cam = this.camera.cam;
      cam.position.set(p.x + Math.sin(t * 0.25) * 11, 3.5, p.z + Math.cos(t * 0.25) * 11);
      cam.lookAt(p.x, 0.8, p.z);
      this.traffic.update(dt);
      this.traffic.sync();
      this.renderer.render(this.scene, cam);
      return;
    }

    if (!this.paused) {
      this.acc += dt;
      while (this.acc >= PHYSICS.step) {
        this.step(PHYSICS.step);
        this.acc -= PHYSICS.step;
      }
      this.updateVisuals(dt);
    }
    this.renderer.render(this.scene, this.camera.cam);
  }

  private step(dt: number): void {
    const racing = this.state === 'race';
    const player = this.player;
    const L = this.track.length;

    if (this.state === 'countdown') {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown);
      if (n !== this.lastCount) {
        this.lastCount = n;
        if (n > 0) {
          this.hud.message(String(n), 0.9);
          this.sound.beep(false);
        } else {
          this.hud.message('GO!', 0.8, '#3dff7a');
          this.sound.beep(true);
          this.state = 'race';
        }
      }
    } else {
      this.raceTime += racing ? dt : 0;
    }

    // État de la voiture
    if (this.damageCooldown > 0) this.damageCooldown -= dt;
    if (this.ghost > 0) this.ghost -= dt;
    if (this.respawnTimer > 0) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.respawn();
    }

    // Joueur
    const input: DriveInput =
      this.respawnTimer > 0
        ? { throttle: 0, brake: 1, steer: 0, nitro: false, analog: false, noReverse: true }
        : this.state === 'race'
        ? this.readInput()
        : this.state === 'countdown'
          ? { throttle: 0, brake: 1, steer: 0, nitro: false, analog: false, noReverse: true }
          : { throttle: 0, brake: 0.4, steer: 0, nitro: false, analog: false, noReverse: true };
    if (this.state !== 'countdown') player.step(dt, input, this.track);

    // Tours
    const s = player.proj.s;
    if (this.prevS > L * 0.75 && s < L * 0.25) {
      this.lap++;
      if (racing && this.lap >= 1) {
        const lt = this.raceTime - this.lapStart;
        if (this.bestLap === null || lt < this.bestLap) this.bestLap = lt;
        this.lapStart = this.raceTime;
        if (this.lap < this.laps) {
          this.hud.message(this.lap === this.laps - 1 ? 'DERNIER TOUR' : `TOUR ${this.lap + 1}`, 1.4, '#2de2ff');
        }
      } else if (racing && this.lap === 0) {
        this.lapStart = this.raceTime;
      }
      if (racing && this.lap >= this.laps) this.finish();
    } else if (this.prevS < L * 0.25 && s > L * 0.75) {
      this.lap--;
    }
    this.prevS = s;
    const playerProgress = this.lap * L + s;

    // Sens interdit
    const i = player.proj.index;
    const along = player.vx * this.track.tx[i] + player.vz * this.track.tz[i];
    this.wrongWay = racing && along < -4 ? this.wrongWay + dt : 0;

    // Drift → nitro
    if (racing && player.drifting) {
      player.nitro = Math.min(1, player.nitro + NITRO.driftCharge * this.nitroChargeMul * dt);
    }

    // IA
    this.obstacles.length = 0;
    for (const c of this.traffic.cars) this.obstacles.push(c);
    for (const a of this.ais) this.obstacles.push(a);
    for (const ai of this.ais) {
      const aiRacing = this.state === 'race' && !ai.finished;
      ai.update(dt, playerProgress, this.obstacles, aiRacing || (this.state !== 'countdown' && ai.finished));
      if (!ai.finished && ai.lap >= this.laps) {
        ai.finished = true;
        ai.finishTime = this.raceTime;
      }
    }

    this.traffic.update(dt);

    // Police (en pause pendant une réapparition : pas de BUSTED injuste)
    if (racing && this.respawnTimer <= 0) {
      const ev = this.police.update(dt, {
        progress: playerProgress,
        s,
        lateral: player.proj.lateral,
        speed: player.speed,
        x: player.x,
        z: player.z,
        lap: this.lap,
      });
      if (ev === 'spawn') {
        this.hud.message('POLICE !', 1.5, '#ff2d55');
        this.hud.toast(`PERCUTEZ-LA ${POLICE.ramHits} FOIS À 50 KM/H+ POUR LA CASSER`, '#ffb02d');
        vibrate([60, 40, 60]);
      } else if (ev === 'escaped') {
        this.hud.message('SEMÉE !', 1.5, '#3dff7a');
        player.nitro = Math.min(1, player.nitro + 0.3);
      } else if (ev === 'busted') {
        this.bust();
      }
    } else if (this.police.active && this.police.wrecked) {
      // l'épave continue de glisser et de fumer après l'arrivée
      this.police.update(dt, { progress: playerProgress, s, lateral: 0, speed: 0, x: player.x, z: player.z, lap: this.lap });
    }

    this.collisions(dt, racing);
    this.hitBins(dt, racing);

    if (player.wallImpact > 0) {
      // un vrai choc contre la bordure abîme la voiture (un frottement, non)
      if (racing && this.ghost <= 0 && player.wallImpact > DAMAGE.wallImpact) this.addDamage(WALL);
      if (player.wallImpact > 6) {
        const k = clamp(player.wallImpact / 25, 0, 1);
        this.camera.shake(0.25 + k * 0.5);
        this.sound.crash(k * 0.6);
        vibrate(Math.round(20 + k * 60));
      }
      player.wallImpact = 0;
    }

    if (this.state === 'finished' || this.state === 'busted') {
      this.endTimer += dt;
      if (this.endTimer > 2.2 && this.onEnd) {
        const cb = this.onEnd;
        this.onEnd = null;
        cb(this.buildResult());
      }
    }
  }

  /** Collisions joueur ↔ véhicules sur rail (boîtes orientées approximées). */
  private collisions(_dt: number, racing: boolean): void {
    const p = this.player;
    const bodies: { b: RailBody; kind: 'ai' | 'traffic' | 'police' }[] = [];
    for (const a of this.ais) bodies.push({ b: a, kind: 'ai' });
    for (const c of this.traffic.cars) bodies.push({ b: c, kind: 'traffic' });
    if (this.police.active) bodies.push({ b: this.police, kind: 'police' });

    // fantôme après réapparition (ou épave) : on traverse les véhicules
    const solid = this.ghost <= 0 && this.respawnTimer <= 0;
    for (const { b, kind } of bodies) {
      if (!solid) break;
      const dx = p.x - b.x, dz = p.z - b.z;
      if (dx * dx + dz * dz > 49) {
        if (kind === 'traffic') {
          const c = b as TrafficCar;
          if (dx * dx + dz * dz > 400) c.nearMissArmed = true;
        }
        continue;
      }
      const fx = Math.sin(b.h), fz = Math.cos(b.h);
      const rx = -fz, rz = fx;
      const lf = dx * fx + dz * fz;
      const ll = dx * rx + dz * rz;
      const penF = 4.3 - Math.abs(lf);
      const penL = 2.0 - Math.abs(ll);

      if (penF <= 0 || penL <= 0) {
        // frôlement de trafic → nitro
        if (kind === 'traffic' && racing) {
          const c = b as TrafficCar;
          const rel = p.speed - c.speed;
          if (c.nearMissArmed && Math.abs(lf) < 2.5 && Math.abs(ll) < NITRO.nearMissDist && rel > NITRO.nearMissMinRel) {
            c.nearMissArmed = false;
            p.nitro = Math.min(1, p.nitro + NITRO.nearMissCharge * this.nitroChargeMul);
            this.hud.toast('NEAR MISS +NITRO', '#2de2ff');
            this.sound.whoosh();
          }
        }
        continue;
      }

      let nx: number, nz: number, pen: number;
      if (penL < penF * 0.6) {
        const sg = Math.sign(ll) || 1;
        nx = rx * sg; nz = rz * sg; pen = penL;
      } else {
        const sg = Math.sign(lf) || 1;
        nx = fx * sg; nz = fz * sg; pen = penF;
      }
      const hitSpeed = p.speed; // vitesse du joueur au moment du choc
      // séparation
      p.x += nx * pen * 0.8;
      p.z += nz * pen * 0.8;
      const ts = this.track.sampleAt(b.s, this.tmpSample);
      const dLane = -(nx * ts.rx + nz * ts.rz) * pen * 0.2;
      // réponse en vitesse
      const rel = (p.vx - b.vx) * nx + (p.vz - b.vz) * nz;
      if (rel >= 0) continue;
      p.vx -= nx * rel * 1.25;
      p.vz -= nz * rel * 1.25;
      const impact = -rel;
      const along = -(nx * fx + nz * fz); // >0 si le joueur pousse par l'arrière
      // Dégâts : trafic et IA uniquement (la police ne compte pas)
      if (racing && kind !== 'police' && impact > DAMAGE.minImpact) {
        // « de front » : le choc repousse la voiture vers l'arrière (c'est son avant qui a tapé)
        const frontal = nx * Math.sin(p.h) + nz * Math.cos(p.h) < -DAMAGE.headOnDot;
        if (kind === 'traffic' && frontal && hitSpeed >= DAMAGE.headOnSpeed) this.wreck(true);
        else this.addDamage(b);
      }
      if (kind === 'traffic') {
        const c = b as TrafficCar;
        c.nearMissArmed = false;
        if (impact > 3) {
          p.vx *= TRAFFIC.hitSlow;
          p.vz *= TRAFFIC.hitSlow;
          c.speed = Math.max(4, c.speed * 0.5);
          c.lane = clamp(c.lane + dLane * 3, -TRACK.halfWidth + 1.2, TRACK.halfWidth - 1.2);
          c.laneVel = dLane * 20;
        }
      } else if (kind === 'ai') {
        (b as AIDriver).nudge(dLane, along > 0.5 ? impact * 0.3 : -impact * 0.2);
      } else {
        this.police.nudge(dLane * 0.5, along > 0.5 ? impact * 0.2 : -impact * 0.1);
        if (racing) this.ramPolice(hitSpeed);
      }
      if (impact > 3) {
        const k = clamp(impact / 25, 0, 1);
        this.camera.shake(0.3 + k * 0.6);
        this.sound.crash(k);
        vibrate(Math.round(30 + k * 90));
      }
    }

    // IA ↔ trafic / IA : on évite l'interpénétration
    for (const ai of this.ais) {
      for (const o of this.obstacles) {
        if (o === ai) continue;
        const ob = o as RailBody;
        const dx = ai.x - ob.x, dz = ai.z - ob.z;
        if (dx * dx + dz * dz > 18) continue;
        let ds = ob.s - ai.s;
        if (ds < -this.track.length / 2) ds += this.track.length;
        if (ds > 0 && Math.abs(ai.lane - ob.lane) < 2) {
          ai.speed = Math.min(ai.speed, ob.speed * 0.95);
          ai.nudge(ai.lane >= ob.lane ? 0.05 : -0.05, 0);
        }
      }
    }
  }

  private addDamage(body: object): void {
    if (this.damageCooldown > 0 || this.respawnTimer > 0) return;
    if (body === this.lastDamageBody && this.raceTime - this.lastDamageTime < 1.5) return;
    this.lastDamageBody = body;
    this.lastDamageTime = this.raceTime;
    this.damageCooldown = DAMAGE.cooldown;
    this.damage++;
    if (this.damage >= DAMAGE.maxHits) this.wreck(false);
    else this.hud.toast(`ACCROCHAGE ${this.damage}/${DAMAGE.maxHits}`, this.damage >= DAMAGE.maxHits - 1 ? '#ff2d55' : '#ffb02d');
  }

  /** Voiture détruite : courte séquence d'épave puis réapparition. */
  private wreck(headOn: boolean): void {
    if (this.respawnTimer > 0) return;
    this.damage = DAMAGE.maxHits;
    this.respawnTimer = DAMAGE.respawnDelay;
    this.respawns++;
    this.hud.message(headOn ? 'CHOC FRONTAL !' : 'VOITURE HS !', DAMAGE.respawnDelay, '#ff2d55');
    this.camera.shake(1);
    this.sound.crash(1);
    vibrate([150, 60, 250]);
  }

  /** Réapparition au même endroit du circuit, au milieu de la route, relancée et invulnérable. */
  private respawn(): void {
    const p = this.player;
    const t = this.track.sampleAt(p.proj.s, this.tmpSample);
    p.x = t.x;
    p.z = t.z;
    p.h = Math.atan2(t.tx, t.tz);
    p.vx = t.tx * DAMAGE.respawnSpeed;
    p.vz = t.tz * DAMAGE.respawnSpeed;
    p.steer = 0;
    this.track.project(p.x, p.z, p.proj.index, p.proj);
    this.prevS = p.proj.s; // même abscisse : aucun faux passage de ligne
    this.damage = 0;
    this.damageCooldown = 0;
    this.ghost = DAMAGE.ghostTime;
    this.camera.snap(p.x, p.z, p.h);
    this.hud.toast('VOITURE RÉPARÉE !', '#3dff7a', 1.5);
  }

  /** Coup de bélier sur la police : au bout de 3 coups à ≥ 50 km/h, elle est détruite. */
  private ramPolice(hitSpeed: number): void {
    const r = this.police.ram(hitSpeed);
    if (r === 'hit') {
      const left = POLICE.ramHits - this.police.hits;
      this.hud.toast(`COUP SUR LA POLICE ${this.police.hits}/${POLICE.ramHits} — ENCORE ${left} !`, '#ffb02d');
      this.camera.shake(0.35);
      vibrate(60);
    } else if (r === 'wreck') {
      this.wrecks++;
      this.score += POLICE.wreckBonus;
      this.hud.message('POLICE DÉTRUITE !', 2, '#ffb02d');
      this.hud.toast(`VOITURE DE POLICE KO +${POLICE.wreckBonus}`, '#7dff6a');
      this.hud.bumpScore();
      this.player.nitro = 1;
      this.camera.shake(0.8);
      this.sound.crash(1);
      vibrate([80, 40, 160]);
    }
  }

  /** Poubelles : la voiture du joueur marque des points, l'IA les renverse gratuitement. */
  private hitBins(dt: number, racing: boolean): void {
    const p = this.player;
    for (const ai of this.ais) this.bins.collide(ai.x, ai.z, ai.h, ai.vx, ai.vz);
    if (this.police.active) this.bins.collide(this.police.x, this.police.z, this.police.h, this.police.vx, this.police.vz);
    if (this.state !== 'countdown') {
      const pulled = this.bins.attract(p.x, p.z, p.vx, p.vz, p.h, this.magnetRadius, this.magnetPull, dt);
      this.magnetToast = Math.max(0, this.magnetToast - dt);
      if (pulled > 0 && racing && this.magnetToast === 0) {
        this.hud.toast('AIMANT ACTIF !', '#7dff6a');
        this.magnetToast = 4;
      }
    }
    const hits = this.state === 'countdown' ? 0 : this.bins.collide(p.x, p.z, p.h, p.vx, p.vz, this.magnetReach);
    this.bins.update(dt, p.x, p.z);
    if (hits === 0) return;
    for (let k = 0; k < hits; k++) {
      p.vx *= BINS.carSlow;
      p.vz *= BINS.carSlow;
      const now = this.raceTime + this.endTimer;
      this.combo = now - this.lastBinHit < BINS.comboWindow ? Math.min(BINS.maxCombo, this.combo + 1) : 1;
      this.lastBinHit = now;
      if (!racing) continue; // après l'arrivée : ça vole toujours, mais ça ne compte plus
      const pts = Math.round((BINS.points * this.magnetPoints * this.combo) / 10) * 10;
      this.score += pts;
      this.binCount++;
      this.hud.toast(this.combo > 1 ? `POUBELLE ! +${pts} ×${this.combo}` : `POUBELLE ! +${pts}`, '#7dff6a');
      this.hud.bumpScore();
    }
    this.sound.clang(this.combo);
    this.camera.shake(0.12);
    vibrate(25);
  }

  private finish(): void {
    this.state = 'finished';
    this.finishTime = this.raceTime;
    const ahead = this.ais.filter((a) => a.finished).length;
    this.finishPosition = ahead + 1;
    const pos = this.finishPosition;
    this.hud.message(pos === 1 ? 'VICTOIRE !' : `${pos}${pos === 1 ? 'er' : 'e'}`, 0, pos === 1 ? '#ffd23f' : '#fff');
    this.police.reset();
    vibrate([50, 50, 120]);
  }

  private bust(): void {
    this.state = 'busted';
    this.hud.message('BUSTED', 0, '#ff2d55');
    this.camera.shake(0.6);
    this.sound.crash(1);
    vibrate([200, 80, 200]);
  }

  private buildResult(): RaceResult {
    const L = this.track.length;
    const busted = this.state === 'busted';
    const rows: RaceResult['standings'] = [];
    const playerTime = busted ? null : this.finishTime;
    rows.push({
      name: 'VOUS',
      color: hex(this.player.spec.color),
      time: playerTime,
      player: true,
      estimated: false,
    });
    for (const ai of this.ais) {
      let time: number | null;
      let est = false;
      if (ai.finished) time = ai.finishTime;
      else {
        const remain = this.laps * L - ai.progress;
        time = this.raceTime + remain / Math.max(ai.speed, 35);
        est = true;
      }
      rows.push({ name: ai.name, color: hex(AI.colors[this.ais.indexOf(ai)]), time, player: false, estimated: est });
    }
    rows.sort((a, b) => {
      if (a.time === null) return 1;
      if (b.time === null) return -1;
      return a.time - b.time;
    });
    const record = busted ? { race: false, lap: false } : Save.submit(this.track.def.id, playerTime, this.bestLap);
    const scoreRecord = Save.submitScore(this.score);
    this.bankScore();
    return {
      busted,
      position: busted ? 0 : rows.findIndex((r) => r.player) + 1,
      time: playerTime,
      bestLap: this.bestLap,
      standings: rows,
      record,
      bins: this.binCount,
      score: this.score,
      scoreRecord,
      wrecks: this.wrecks,
      trackId: this.track.def.id,
      trackName: this.track.def.name,
      wallet: Save.wallet,
    };
  }

  private updateVisuals(dt: number): void {
    const p = this.player;
    const L = this.track.length;
    p.syncMesh();
    // clignote pendant l'invulnérabilité, tremble pendant l'épave
    p.mesh.visible = this.ghost > 0 ? Math.floor(this.ghost * 12) % 2 === 0 : true;
    if (this.respawnTimer > 0) {
      p.mesh.rotation.z = Math.sin(this.respawnTimer * 40) * 0.06;
      p.mesh.rotation.x = -0.05;
    }
    for (const ai of this.ais) ai.syncMesh();
    this.traffic.sync();
    this.bins.sync();
    this.police.syncMesh(dt);

    const ratio = clamp(p.speed / p.spec.maxSpeed, 0, 1.3);
    this.camera.update(dt, p.x, p.z, p.h, ratio, p.nitroActive);
    this.trails.update(dt, p.x, p.z, p.h, p.nitroActive);

    if (p.nitroActive && !this.lastNitro) {
      this.sound.nitro();
      vibrate(40);
      this.camera.shake(0.2);
    }
    this.lastNitro = p.nitroActive;

    const input = this.state === 'race' ? this.readInput() : null;
    this.sound.engine(Math.min(1, p.speed / (p.spec.maxSpeed * NITRO.boostSpeed)), input ? input.throttle : 0, true);
    const pd = this.police.active ? Math.hypot(this.police.x - p.x, this.police.z - p.z) : 999;
    this.sound.siren(this.police.active && !this.police.wrecked, clamp(1 - pd / 150, 0, 1), dt);

    // Classement en direct
    const playerProgress = this.lap * L + p.proj.s;
    let position = 1;
    for (const ai of this.ais) {
      if (ai.finished || ai.progress > playerProgress) position++;
    }
    if (this.state === 'finished') position = this.finishPosition;

    if (this.state === 'race') {
      if (p.drifting) this.hud.toast('DRIFT +NITRO');
      if (this.wrongWay > 1) this.hud.toast('SENS INTERDIT', '#ff2d55');
    }

    this.hud.update(
      {
        speedKmh: p.speed * 3.6,
        position,
        total: this.ais.length + 1,
        lap: this.lap + 1,
        laps: this.laps,
        time: this.state === 'finished' && this.finishTime !== null ? this.finishTime : this.raceTime,
        lapTime: this.state === 'race' && this.lap >= 0 ? this.raceTime - this.lapStart : 0,
        bestLap: this.bestLap ?? Save.bestLap(this.track.def.id),
        nitro: p.nitro,
        nitroActive: p.nitroActive,
        heat: this.police.heat,
        pursuit: this.police.active && !this.police.wrecked,
        bust: this.police.bustTimer / POLICE.bustTime,
        score: this.score,
        policeHits: this.police.hits,
        policeHitsMax: POLICE.ramHits,
        damage: this.damage,
        damageMax: DAMAGE.maxHits,
      },
      dt,
    );

    // Mini-map
    const dots = this.dots;
    dots.length = 0;
    for (const c of this.traffic.cars) dots.push({ x: c.x, z: c.z, color: '#777', size: 2 });
    this.ais.forEach((ai, i) => dots.push({ x: ai.x, z: ai.z, color: hex(AI.colors[i]), size: 3.5 }));
    if (this.police.active) {
      dots.push({ x: this.police.x, z: this.police.z, color: this.police.wrecked ? '#555' : Math.floor(performance.now() / 150) % 2 ? '#f00' : '#04f', size: 4 });
    }
    dots.push({ x: p.x, z: p.z, color: hex(p.spec.color), size: 5 });
    this.minimap.draw(dots);
  }
}
