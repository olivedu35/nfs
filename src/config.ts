// Toute la configuration gameplay est centralisée ici pour faciliter l'équilibrage.
// Unités : mètres, secondes, m/s (affichage km/h = m/s × 3.6).

export interface CarSpec {
  id: string;
  name: string;
  color: number;
  maxSpeed: number; // m/s
  accel: number; // m/s²
  handling: number; // vitesse de lacet max (rad/s)
  grip: number; // amortissement de la vitesse latérale (1/s)
  stats: { speed: number; accel: number; handling: number }; // 0..1 pour l'affichage
}

export const CARS: CarSpec[] = [
  { id: 'viper', name: 'VIPER', color: 0xff2d55, maxSpeed: 66, accel: 15, handling: 1.7, grip: 10,
    stats: { speed: 1, accel: 0.55, handling: 0.55 } },
  { id: 'bolt', name: 'BOLT', color: 0xffd23f, maxSpeed: 60, accel: 21, handling: 1.85, grip: 11,
    stats: { speed: 0.75, accel: 1, handling: 0.7 } },
  { id: 'drifter', name: 'DRIFTER', color: 0x2de2ff, maxSpeed: 61, accel: 17, handling: 2.15, grip: 12.5,
    stats: { speed: 0.8, accel: 0.7, handling: 1 } },
];

export const PHYSICS = {
  step: 1 / 120,
  maxFrame: 0.25,
  brakeDecel: 32,
  reverseMax: 8,
  reverseAccel: 10,
  drag: 0.12, // décélération proportionnelle à v (1/s)
  rolling: 2.5, // décélération constante (m/s²)
  steerRate: 5.5, // vitesse de montée de la direction (boutons)
  steerReturn: 9,
  driftGrip: 1.8, // grip latéral quand on freine en braquant à haute vitesse
  driftMinSpeed: 18,
  driftThreshold: 5.5, // vitesse latérale (m/s) au-delà de laquelle on est « en drift »
  wallSlow: 0.55, // facteur sur la vitesse en touchant un mur
  carRadius: 1.7,
};

export const TRACK = {
  halfWidth: 9,
  samples: 900,
  laps: 3,
  wallHeight: 1.1,
};

export const NITRO = {
  start: 0.35,
  drain: 0.33, // par seconde
  driftCharge: 0.16, // par seconde de drift
  nearMissCharge: 0.14,
  nearMissDist: 4.2,
  nearMissMinRel: 8, // vitesse relative min (m/s)
  boostAccel: 16,
  boostSpeed: 1.25, // multiplicateur de vitesse max
  fovBoost: 14,
};

export const AI = {
  count: 3,
  names: ['RAZOR', 'NOVA', 'GHOST'],
  colors: [0x9b5cff, 0x3dff7a, 0xff8c2d],
  skill: [0.97, 0.94, 0.91], // fraction de la vitesse max de référence
  refMaxSpeed: 62,
  accel: 15,
  latAccel: 19, // accélération latérale max en virage (m/s²)
  rubberBand: 0.09, // ± fraction de vitesse
  rubberDist: 160, // distance (m) pour un rubber band complet
  laneWander: 3.5,
};

export const TRAFFIC = {
  count: 8,
  minSpeed: 12,
  maxSpeed: 19,
  lanes: [-4.5, 4.5],
  colors: [0xdddddd, 0x5577aa, 0x557755, 0xaa8855, 0x884444, 0x666677],
  hitSlow: 0.45,
};

export const POLICE = {
  heatSpeed: 41, // m/s (~148 km/h)
  heatRise: 0.16, // par seconde au-dessus du seuil (≈ 6 s cumulées pour déclencher)
  heatDecay: 0.04,
  spawnBehind: 90,
  speed: 70,
  accel: 22,
  bustDist: 7,
  bustSpeed: 9, // vitesse joueur (m/s) en dessous de laquelle le blocage compte
  bustTime: 3,
  escapeDist: 260,
  escapeTime: 5,
};

export const CAMERA = {
  distance: 7.5,
  height: 3.2,
  lookAhead: 6,
  lerp: 6,
  fov: 62,
  fovSpeed: 14, // FOV ajouté à vitesse max
  shakeDecay: 2.2,
};

export const RENDER = {
  maxDpr: 1.5,
  fogNear: 60,
  fogFar: 280,
  sky: 0x0b0d1a,
};
