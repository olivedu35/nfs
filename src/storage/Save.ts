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
  settings: Settings;
}

const KEY = 'nightrush.v1';
const DEFAULTS: SaveData = {
  bestRace: null,
  bestLap: null,
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
