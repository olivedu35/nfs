import { TRACKS, TrackDef } from './tracks';
import type { RaceResult } from './Game';

/** Points par place (1er → 4e). */
export const CHAMP_POINTS = [10, 6, 3, 1];
/** Prime (monnaie de la boutique) selon la place finale au championnat. */
export const CHAMP_BONUS = [20000, 10000, 5000, 2000];

export interface ChampRow {
  name: string;
  color: string;
  player: boolean;
  points: number;
  /** points gagnés à la dernière manche */
  gained: number;
}

/** Championnat : les 4 circuits enchaînés, classement général aux points. */
export class Championship {
  active = false;
  round = 0;
  readonly tracks: TrackDef[] = TRACKS;
  private table = new Map<string, ChampRow>();

  start(): void {
    this.active = true;
    this.round = 0;
    this.table.clear();
  }

  stop(): void {
    this.active = false;
  }

  get track(): TrackDef {
    return this.tracks[this.round];
  }

  get total(): number {
    return this.tracks.length;
  }

  get isLastRound(): boolean {
    return this.round >= this.tracks.length - 1;
  }

  /** Attribue les points de la manche (classement de la course, BUSTED = dernier). */
  record(r: RaceResult): void {
    for (const row of this.table.values()) row.gained = 0;
    r.standings.forEach((s, i) => {
      const row = this.table.get(s.name) ?? { name: s.name, color: s.color, player: s.player, points: 0, gained: 0 };
      row.gained = CHAMP_POINTS[i] ?? 0;
      row.points += row.gained;
      this.table.set(s.name, row);
    });
  }

  next(): void {
    this.round++;
  }

  standings(): ChampRow[] {
    // à égalité de points, le joueur passe devant (progression « ridiculement facile »)
    return [...this.table.values()].sort((a, b) => b.points - a.points || Number(b.player) - Number(a.player));
  }

  playerPlace(): number {
    return this.standings().findIndex((r) => r.player) + 1;
  }
}
