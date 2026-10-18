// Toute la configuration gameplay est centralisée ici pour faciliter l'équilibrage.
// Unités : mètres, secondes, m/s (affichage km/h = m/s × 3.6).

// ---------------------------------------------------------------- esthétique
export type CosmeticSlot = 'spoiler' | 'exhaust' | 'sticker';

export interface CosmeticOption {
  id: string;
  name: string;
  cost: number; // 0 = débloqué d'office (premier choix de chaque catégorie)
}

/** Le premier choix de chaque catégorie est toujours gratuit : c'est l'apparence d'origine. */
export const COSMETICS: Record<CosmeticSlot, CosmeticOption[]> = {
  spoiler: [
    { id: 'stock', name: 'AILERON D’ORIGINE', cost: 0 },
    { id: 'gt', name: 'AILERON GT', cost: 1500 },
    { id: 'drift', name: 'AILERON DRIFT', cost: 3000 },
  ],
  exhaust: [
    { id: 'stock', name: 'ÉCHAPPEMENT D’ORIGINE', cost: 0 },
    { id: 'dual', name: 'DOUBLE SORTIE', cost: 1200 },
    { id: 'chrome', name: 'GROS CHROME', cost: 2200 },
  ],
  sticker: [
    { id: 'none', name: 'AUCUN STICKER', cost: 0 },
    { id: 'stripes', name: 'BANDES DE COURSE', cost: 900 },
    { id: 'flames', name: 'FLAMMES', cost: 1800 },
    { id: 'tribal', name: 'TRIBAL', cost: 1800 },
  ],
};

export const COSMETIC_SLOTS: { slot: CosmeticSlot; label: string }[] = [
  { slot: 'spoiler', label: 'AILERON' },
  { slot: 'exhaust', label: 'ÉCHAPPEMENT' },
  { slot: 'sticker', label: 'STICKERS' },
];

export type CarCosmetics = Record<CosmeticSlot, string>;

/** Apparence d'origine : toujours possédée, utilisée par défaut (IA, police…). */
export const STOCK_COSMETICS: CarCosmetics = { spoiler: 'stock', exhaust: 'stock', sticker: 'none' };

export interface CarSpec {
  id: string;
  name: string;
  color: number;
  maxSpeed: number; // m/s
  accel: number; // m/s²
  handling: number; // vitesse de lacet max (rad/s)
  grip: number; // amortissement de la vitesse latérale (1/s)
  stats: { speed: number; accel: number; handling: number }; // 0..1 pour l'affichage
  cosmetics?: CarCosmetics;
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

export const RAMP = {
  length: 11, // m, longueur de la montée du tremplin
  height: 2.2, // m, hauteur en bout de tremplin
  minSpeed: 14, // m/s, vitesse mini pour décoller proprement
  launchSpeed: 12, // m/s, vitesse verticale au décollage
  gravity: 18, // m/s²
  nitroPerSecond: 0.5, // remplissage de la jauge nitro par seconde passée en l'air
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
  // Police cassable : N coups à vitesse ≥ ramSpeed la mettent KO
  ramHits: 3,
  ramSpeed: 50 / 3.6, // m/s (50 km/h)
  ramCooldown: 0.5, // s entre deux coups comptés
  wreckBonus: 5000, // points (monnaie) pour une voiture de police détruite
  wreckDespawn: 10, // s avant que l'épave disparaisse
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
  // halo lumineux (néons, phares, fenêtres) : résolution réduite de moitié pour rester mobile-friendly
  bloomStrength: 0.32,
  bloomRadius: 0.35,
  bloomThreshold: 0.82,
  toneExposure: 1.0,
  // vignette dynamique : plus marquée à haute vitesse / en nitro, pour la sensation de vitesse
  vignetteBase: 1.0,
  vignetteSpeed: 0.55,
  vignetteNitro: 0.45,
};

/** État de la voiture : accrochages avant destruction et réapparition. */
export const DAMAGE = {
  maxHits: 5, // accrochages (trafic, IA et bordures ; pas la police) avant destruction
  wallImpact: 7, // m/s de vitesse perpendiculaire au mur (~25 km/h) : en dessous c'est un simple frottement
  minImpact: 3, // vitesse d'impact (m/s) minimale pour compter un accrochage
  cooldown: 0.6, // s : un même choc prolongé ne compte qu'une fois
  headOnSpeed: 150 / 3.6, // choc frontal contre le trafic au-delà → destruction immédiate
  headOnDot: 0.6, // seuil « de front » (cosinus entre l'avant de la voiture et le choc)
  respawnDelay: 1.3, // s d'épave avant réapparition
  ghostTime: 2, // s d'invulnérabilité après réapparition
  respawnSpeed: 12, // m/s de relance (~45 km/h)
};

export const BINS = {
  spacing: 26, // m entre deux groupes de poubelles
  lateralMin: 6.4, // hors des files de l'IA et du trafic, côté trottoir
  lateralMax: 8.6,
  points: 1000, // ×10 : c'est la monnaie de la boutique
  comboWindow: 2.5, // s pour enchaîner un combo
  maxCombo: 5,
  respawnTime: 8, // s avant réapparition (hors de vue)
  carSlow: 0.97, // facteur de vitesse par poubelle percutée
};

// ---------------------------------------------------------------- boutique
export type UpgradeId = 'engine' | 'turbo' | 'tires' | 'nitro' | 'magnet';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  desc: string;
}

/** Progression volontairement ridicule : une poubelle (1000 pts) ≈ un niveau au début. */
export const UPGRADE_COSTS = [1000, 1500, 2500, 4000, 6000];

export const UPGRADES: UpgradeDef[] = [
  { id: 'engine', name: 'MOTEUR', desc: '+6 % vitesse max / niv.' },
  { id: 'turbo', name: 'TURBO', desc: '+15 % accélération / niv.' },
  { id: 'tires', name: 'PNEUS', desc: '+7 % maniabilité et adhérence / niv.' },
  { id: 'nitro', name: 'NITRO', desc: 'dure +20 %, recharge +25 % / niv.' },
  { id: 'magnet', name: 'AIMANT À POUBELLES', desc: 'attire les poubelles (portée 13 → 21 m), +25 % de points / niv.' },
];

/** Effet d'un niveau d'amélioration (0..5). */
export const UPGRADE_FX = {
  engine: (l: number) => 1 + 0.06 * l,
  turbo: (l: number) => 1 + 0.15 * l,
  tires: (l: number) => 1 + 0.07 * l,
  nitroDrain: (l: number) => 1 / (1 + 0.2 * l),
  nitroCharge: (l: number) => 1 + 0.25 * l,
  magnetReach: (l: number) => 0.3 * l, // zone de choc élargie
  /** rayon d'attraction (m) : 0 sans l'amélioration, 13 m au niv. 1, 21 m au niv. 5 */
  magnetRadius: (l: number) => (l > 0 ? 11 + 2 * l : 0),
  /** vitesse max (m/s) à laquelle une poubelle glisse vers la voiture */
  magnetPull: (l: number) => 16 + 3.5 * l,
  magnetPoints: (l: number) => 1 + 0.25 * l,
};
