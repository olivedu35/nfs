import { UPGRADE_COSTS, UpgradeId } from '../config';

export type ControlMode = 'buttons' | 'gyro';

export interface Settings {
  control: ControlMode;
  sound: boolean;
  gyroInvert: boolean;
  car: number;
}

interface SaveData {
  bestRace: number | null;
  bestLap: number | null;
  bestScore: number;
  wallet: number;
  upgrades: Record<UpgradeId, number>;
  settings: Settings;
}

const KEY = 'nightrush.v1';
const DEFAULTS: SaveData = {
  bestRace: null,
  bestLap: null,
  bestScore: 0,
  wallet: 5000, // cadeau de bienvenue : de quoi acheter 3 améliorations tout de suite
  upgrades: { engine: 0, turbo: 0, tires: 0, nitro: 0, magnet: 0 },
  settings: { control: 'buttons', sound: true, gyroInvert: false, car: 0 },
};

function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const d = JSON.parse(raw) as Partial<SaveData>;
    return {
      bestRace: d.bestRace ?? null,
      bestLap: d.bestLap ?? null,
      bestScore: d.bestScore ?? 0,
      wallet: d.wallet ?? DEFAULTS.wallet,
      upgrades: { ...DEFAULTS.upgrades, ...(d.upgrades ?? {}) },
      settings: { ...DEFAULTS.settings, ...(d.settings ?? {}) },
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

const data = load();

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* stockage indisponible : on ignore */
  }
}

export const Save = {
  get settings(): Settings {
    return data.settings;
  },
  setSettings(patch: Partial<Settings>): void {
    Object.assign(data.settings, patch);
    persist();
  },
  get bestRace(): number | null {
    return data.bestRace;
  },
  get bestScore(): number {
    return data.bestScore;
  },
  /** Score poubelles : enregistré même en cas de BUSTED (c'est pour le fun). */
  submitScore(score: number): boolean {
    if (score <= data.bestScore) return false;
    data.bestScore = score;
    persist();
    return true;
  },
  get wallet(): number {
    return data.wallet;
  },
  /** Ajoute les points gagnés en course au portefeuille. */
  deposit(points: number): void {
    if (points <= 0) return;
    data.wallet += points;
    persist();
  },
  level(id: UpgradeId): number {
    return data.upgrades[id];
  },
  /** Coût du prochain niveau, ou null si déjà au max. */
  nextCost(id: UpgradeId): number | null {
    const l = data.upgrades[id];
    return l < UPGRADE_COSTS.length ? UPGRADE_COSTS[l] : null;
  },
  buy(id: UpgradeId): boolean {
    const cost = this.nextCost(id);
    if (cost === null || data.wallet < cost) return false;
    data.wallet -= cost;
    data.upgrades[id]++;
    persist();
    return true;
  },
  get bestLap(): number | null {
    return data.bestLap;
  },
  /** Enregistre les temps et renvoie ce qui a été battu. */
  submit(race: number | null, lap: number | null): { race: boolean; lap: boolean } {
    const res = { race: false, lap: false };
    if (race !== null && (data.bestRace === null || race < data.bestRace)) {
      data.bestRace = race;
      res.race = true;
    }
    if (lap !== null && (data.bestLap === null || lap < data.bestLap)) {
      data.bestLap = lap;
      res.lap = true;
    }
    persist();
    return res;
  },
};

export function formatTime(t: number | null): string {
  if (t === null || !isFinite(t)) return '--:--.--';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}
