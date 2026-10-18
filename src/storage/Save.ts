import { COSMETICS, CosmeticSlot, UPGRADE_COSTS, UpgradeId } from '../config';
import { CAR_UNLOCK, CAREER, currentTierIndex, tierCleared } from '../game/Career';

export type ControlMode = 'buttons' | 'gyro';

export interface Settings {
  control: ControlMode;
  sound: boolean;
  gyroInvert: boolean;
  car: number;
}

interface TrackRecord {
  race: number | null;
  lap: number | null;
  air: number | null;
}

interface SaveData {
  records: Record<string, TrackRecord>;
  champWins: number;
  bestScore: number;
  wallet: number;
  upgrades: Record<UpgradeId, number>;
  settings: Settings;
  /** esthétique possédée, par catégorie (le premier choix de chaque catégorie y est toujours) */
  cosmeticsOwned: Record<CosmeticSlot, string[]>;
  /** esthétique équipée, par voiture (index dans CARS) puis par catégorie */
  cosmeticsEquipped: Record<number, Partial<Record<CosmeticSlot, string>>>;
  /** identifiants des épreuves de carrière réussies */
  careerPassed: string[];
}

const KEY = 'nightrush.v1';

/** Le premier choix de chaque catégorie est gratuit : toujours possédé d'office. */
function defaultOwned(): Record<CosmeticSlot, string[]> {
  const out = {} as Record<CosmeticSlot, string[]>;
  for (const slot of Object.keys(COSMETICS) as CosmeticSlot[]) out[slot] = [COSMETICS[slot][0].id];
  return out;
}

function mergeOwned(d?: Partial<Record<CosmeticSlot, string[]>>): Record<CosmeticSlot, string[]> {
  const out = defaultOwned();
  for (const slot of Object.keys(COSMETICS) as CosmeticSlot[]) {
    out[slot] = [...new Set([...out[slot], ...(d?.[slot] ?? [])])];
  }
  return out;
}

const DEFAULTS: SaveData = {
  records: {},
  champWins: 0,
  bestScore: 0,
  wallet: 5000, // cadeau de bienvenue : de quoi acheter 3 améliorations tout de suite
  upgrades: { engine: 0, turbo: 0, tires: 0, nitro: 0, magnet: 0 },
  settings: { control: 'buttons', sound: true, gyroInvert: false, car: 0 },
  cosmeticsOwned: defaultOwned(),
  cosmeticsEquipped: {},
  careerPassed: [],
};

function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const d = JSON.parse(raw) as Partial<SaveData> & { bestRace?: number | null; bestLap?: number | null };
    const records = d.records ?? {};
    // migration v1 : les anciens records globaux appartiennent au circuit d'origine
    if (!d.records && (d.bestRace != null || d.bestLap != null)) {
      records.downtown = { race: d.bestRace ?? null, lap: d.bestLap ?? null, air: null };
    }
    return {
      records,
      champWins: d.champWins ?? 0,
      bestScore: d.bestScore ?? 0,
      wallet: d.wallet ?? DEFAULTS.wallet,
      upgrades: { ...DEFAULTS.upgrades, ...(d.upgrades ?? {}) },
      settings: { ...DEFAULTS.settings, ...(d.settings ?? {}) },
      cosmeticsOwned: mergeOwned(d.cosmeticsOwned),
      cosmeticsEquipped: d.cosmeticsEquipped ?? {},
      careerPassed: d.careerPassed ?? [],
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
  bestRace(track: string): number | null {
    return data.records[track]?.race ?? null;
  },
  get champWins(): number {
    return data.champWins;
  },
  addChampWin(): void {
    data.champWins++;
    persist();
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
  bestLap(track: string): number | null {
    return data.records[track]?.lap ?? null;
  },
  /** Enregistre les temps et renvoie ce qui a été battu. */
  submit(track: string, race: number | null, lap: number | null): { race: boolean; lap: boolean } {
    const res = { race: false, lap: false };
    const rec = (data.records[track] ??= { race: null, lap: null, air: null });
    if (race !== null && (rec.race === null || race < rec.race)) {
      rec.race = race;
      res.race = true;
    }
    if (lap !== null && (rec.lap === null || lap < rec.lap)) {
      rec.lap = lap;
      res.lap = true;
    }
    persist();
    return res;
  },
  bestAir(track: string): number | null {
    return data.records[track]?.air ?? null;
  },
  /** Record de temps en l'air sur un tremplin ; renvoie true si battu. */
  submitAir(track: string, airTime: number): boolean {
    const rec = (data.records[track] ??= { race: null, lap: null, air: null });
    const prev = rec.air ?? null;
    if (prev !== null && airTime <= prev) return false;
    rec.air = airTime;
    persist();
    return true;
  },
  ownsCosmetic(slot: CosmeticSlot, id: string): boolean {
    return data.cosmeticsOwned[slot].includes(id);
  },
  /** Achète une pièce esthétique (pas de niveau : un achat unique par pièce). */
  buyCosmetic(slot: CosmeticSlot, id: string): boolean {
    if (this.ownsCosmetic(slot, id)) return false;
    const opt = COSMETICS[slot].find((o) => o.id === id);
    if (!opt || data.wallet < opt.cost) return false;
    data.wallet -= opt.cost;
    data.cosmeticsOwned[slot].push(id);
    persist();
    return true;
  },
  /** Pièce équipée sur une voiture donnée (par défaut : apparence d'origine). */
  equippedCosmetic(car: number, slot: CosmeticSlot): string {
    return data.cosmeticsEquipped[car]?.[slot] ?? COSMETICS[slot][0].id;
  },
  equipCosmetic(car: number, slot: CosmeticSlot, id: string): void {
    (data.cosmeticsEquipped[car] ??= {})[slot] = id;
    persist();
  },
  isCareerEventPassed(id: string): boolean {
    return data.careerPassed.includes(id);
  },
  /** Valide une épreuve de carrière. Renvoie true seulement la première fois (pour la prime/l'annonce). */
  recordCareerResult(id: string): boolean {
    if (data.careerPassed.includes(id)) return false;
    data.careerPassed.push(id);
    persist();
    return true;
  },
  /** Palier actuel (le premier non entièrement validé, sinon le dernier). */
  careerTierIndex(): number {
    return currentTierIndex(data.careerPassed);
  },
  careerTierCleared(tierId: string): boolean {
    const tier = CAREER.find((t) => t.id === tierId);
    return !!tier && tierCleared(tier, data.careerPassed);
  },
  careerTitle(): string {
    return CAREER[this.careerTierIndex()].title;
  },
  isCarUnlocked(carId: string): boolean {
    const req = CAR_UNLOCK[carId];
    return req == null || this.careerTierCleared(req);
  },
};

export function formatTime(t: number | null): string {
  if (t === null || !isFinite(t)) return '--:--.--';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}
