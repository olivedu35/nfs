import type { RaceResult } from './Game';

export type CareerEventType = 'race' | 'score';

export interface CareerEvent {
  id: string;
  trackId: string;
  type: CareerEventType;
  /** 'race' : position à atteindre au mieux (1 = victoire) · 'score' : poubelles minimum */
  target: number;
  reward: number;
}

export interface CareerTier {
  id: string;
  name: string;
  /** titre affiché une fois ce palier atteint */
  title: string;
  /** voiture débloquée une fois CE palier entièrement validé */
  unlockCarId?: string;
  /** prime versée une fois CE palier entièrement validé */
  tierBonus: number;
  events: CareerEvent[];
}

/**
 * Carrière : 4 paliers de 4 épreuves, puisant dans les 7 circuits (et leurs 7 variantes
 * inversées) pour ne jamais enchaîner deux fois le même tracé dans le même sens.
 * Chaque épreuve réussie rapporte une prime ; un palier complet débloque une voiture.
 * Les objectifs « race » sont auto-calibrés (relatifs au peloton IA) ; les objectifs
 * « score » sont volontairement généreux pour ne jamais bloquer la progression.
 */
export const CAREER: CareerTier[] = [
  {
    id: 'rookie',
    name: 'ROOKIE',
    title: 'PILOTE ROOKIE',
    unlockCarId: 'bolt',
    tierBonus: 8000,
    events: [
      { id: 'rookie-1', trackId: 'downtown', type: 'race', target: 4, reward: 3000 },
      { id: 'rookie-2', trackId: 'port', type: 'race', target: 3, reward: 3500 },
      { id: 'rookie-3', trackId: 'oldtown', type: 'score', target: 600, reward: 4000 },
      { id: 'rookie-4', trackId: 'autoroute', type: 'race', target: 3, reward: 5000 },
    ],
  },
  {
    id: 'confirme',
    name: 'CONFIRMÉ',
    title: 'PILOTE CONFIRMÉ',
    unlockCarId: 'drifter',
    tierBonus: 15000,
    events: [
      { id: 'confirme-1', trackId: 'chinatown', type: 'race', target: 2, reward: 6000 },
      { id: 'confirme-2', trackId: 'industrial', type: 'score', target: 1500, reward: 7000 },
      { id: 'confirme-3', trackId: 'riviera', type: 'race', target: 2, reward: 7000 },
      { id: 'confirme-4', trackId: 'downtown-rev', type: 'race', target: 2, reward: 8000 },
    ],
  },
  {
    id: 'pro',
    name: 'PRO',
    title: 'PILOTE PRO',
    tierBonus: 25000,
    events: [
      { id: 'pro-1', trackId: 'port-rev', type: 'race', target: 1, reward: 10000 },
      { id: 'pro-2', trackId: 'oldtown-rev', type: 'race', target: 1, reward: 10000 },
      { id: 'pro-3', trackId: 'autoroute-rev', type: 'score', target: 3000, reward: 12000 },
      { id: 'pro-4', trackId: 'chinatown-rev', type: 'race', target: 1, reward: 14000 },
    ],
  },
  {
    id: 'legende',
    name: 'LÉGENDE',
    title: 'LÉGENDE DE NIGHT RUSH',
    tierBonus: 40000,
    events: [
      { id: 'legende-1', trackId: 'industrial-rev', type: 'race', target: 1, reward: 16000 },
      { id: 'legende-2', trackId: 'riviera-rev', type: 'score', target: 4500, reward: 16000 },
      { id: 'legende-3', trackId: 'chinatown', type: 'race', target: 1, reward: 18000 },
      { id: 'legende-4', trackId: 'autoroute', type: 'race', target: 1, reward: 30000 },
    ],
  },
];

/** Mapping voiture → palier requis pour la débloquer (null = débloquée d'office). */
export const CAR_UNLOCK: Record<string, string | null> = {
  viper: null,
  bolt: 'rookie',
  ranger: 'rookie',
  drifter: 'confirme',
  brute: 'pro',
  apex: 'legende',
};

export interface CareerEventFlat extends CareerEvent {
  tierIndex: number;
  eventIndex: number;
}

export const CAREER_FLAT: CareerEventFlat[] = CAREER.flatMap((tier, tierIndex) =>
  tier.events.map((e, eventIndex) => ({ ...e, tierIndex, eventIndex })),
);

export function careerEvent(id: string): CareerEventFlat | undefined {
  return CAREER_FLAT.find((e) => e.id === id);
}

/** Une épreuve « race » est réussie si l'arrivée est dans le rang visé (pas de BUSTED). */
export function evaluateCareerEvent(ev: CareerEvent, r: RaceResult): boolean {
  if (ev.type === 'race') return !r.busted && r.position > 0 && r.position <= ev.target;
  return r.score >= ev.target;
}

export function eventObjectiveText(ev: CareerEvent): string {
  return ev.type === 'race' ? (ev.target === 1 ? 'VICTOIRE' : `TOP ${ev.target}`) : `${ev.target.toLocaleString('fr-FR')} PTS`;
}

/** Palier entièrement validé ? */
export function tierCleared(tier: CareerTier, passed: string[]): boolean {
  return tier.events.every((e) => passed.includes(e.id));
}

/** Palier courant : le premier non entièrement validé, sinon le dernier. */
export function currentTierIndex(passed: string[]): number {
  const i = CAREER.findIndex((t) => !tierCleared(t, passed));
  return i === -1 ? CAREER.length - 1 : i;
}
