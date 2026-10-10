import { formatTime } from '../storage/Save';

export interface HudState {
  speedKmh: number;
  position: number;
  total: number;
  lap: number;
  laps: number;
  time: number;
  lapTime: number;
  bestLap: number | null;
  nitro: number;
  nitroActive: boolean;
  heat: number;
  pursuit: boolean;
  bust: number;
  score: number;
  policeHits: number;
  policeHitsMax: number;
  damage: number;
  damageMax: number;
}

/** HUD en DOM (aucun texte rendu dans WebGL). N'écrit dans le DOM que si une valeur change. */
export class Hud {
  readonly root: HTMLDivElement;
  readonly mapSlot: HTMLDivElement;
  readonly pauseBtn: HTMLButtonElement;
  private el: Record<string, HTMLElement> = {};
  private cache: Record<string, string> = {};
  private msgTimer = 0;
  private toastTimer = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="hud-tl">
        <button class="pause" aria-label="Pause">II</button>
        <div class="pos"><span data-k="pos">1</span><small>/<span data-k="total">4</span></small></div>
        <div class="lap">TOUR <span data-k="lap">1</span>/<span data-k="laps">3</span></div>
        <div class="score"><span class="bin-ico"></span><span data-k="score">0</span></div>
      </div>
      <div class="hud-tc">
        <div class="time" data-k="time">0:00.00</div>
        <div class="laptime">TOUR <span data-k="laptime">0:00.00</span> · RECORD <span data-k="best">--</span></div>
      </div>
      <div class="hud-tr" data-k="map"></div>
      <div class="hud-bc">
        <div class="speed"><span data-k="speed">0</span><small>KM/H</small></div>
        <div class="bar nitro-bar"><i data-k="nitro"></i><b>NITRO</b></div>
        <div class="bar heat-bar"><i data-k="heat"></i><b data-k="heatlabel">HEAT</b></div>
        <div class="bar dmg-bar"><span class="segs" data-k="dmg"></span><b>DÉGÂTS</b></div>
      </div>
      <div class="msg" data-k="msg"></div>
      <div class="toast" data-k="toast"></div>`;
    parent.appendChild(this.root);
    this.root.querySelectorAll<HTMLElement>('[data-k]').forEach((e) => {
      this.el[e.dataset.k!] = e;
    });
    this.mapSlot = this.el.map as HTMLDivElement;
    this.el.dmg.innerHTML = '<i></i>'.repeat(5);
    this.pauseBtn = this.root.querySelector('.pause')!;
  }

  show(v: boolean): void {
    this.root.hidden = !v;
  }

  private set(k: string, v: string): void {
    if (this.cache[k] === v) return;
    this.cache[k] = v;
    this.el[k].textContent = v;
  }

  private style(k: string, prop: 'width' | 'background', v: string): void {
    const key = `${k}.${prop}`;
    if (this.cache[key] === v) return;
    this.cache[key] = v;
    this.el[k].style[prop] = v;
  }

  private cls(k: string, name: string, on: boolean): void {
    const key = `${k}.c.${name}`;
    const v = on ? '1' : '0';
    if (this.cache[key] === v) return;
    this.cache[key] = v;
    this.el[k].classList.toggle(name, on);
  }

  update(s: HudState, dt: number): void {
    this.set('speed', String(Math.round(s.speedKmh)));
    this.set('score', s.score.toLocaleString('fr-FR'));
    const dmgKey = `${s.damage}/${s.damageMax}`;
    if (this.cache.dmg !== dmgKey) {
      this.cache.dmg = dmgKey;
      const segs = this.el.dmg.children;
      for (let i = 0; i < segs.length; i++) segs[i].classList.toggle('on', i < s.damage);
      this.el.dmg.parentElement!.classList.toggle('critical', s.damage >= s.damageMax - 1);
    }
    this.set('pos', String(s.position));
    this.set('total', String(s.total));
    this.set('lap', String(Math.min(s.laps, Math.max(1, s.lap))));
    this.set('laps', String(s.laps));
    this.set('time', formatTime(s.time));
    this.set('laptime', formatTime(s.lapTime));
    this.set('best', s.bestLap === null ? '--' : formatTime(s.bestLap));
    this.style('nitro', 'width', `${Math.round(s.nitro * 100)}%`);
    this.cls('nitro', 'active', s.nitroActive);
    if (s.pursuit) {
      this.set(
        'heatlabel',
        s.bust > 0.05 ? 'BLOQUÉ !' : `POURSUITE · COUPS ${s.policeHits}/${s.policeHitsMax}`,
      );
      this.style('heat', 'width', `${Math.round(Math.max(s.bust, 0.02) * 100)}%`);
    } else {
      this.set('heatlabel', 'HEAT');
      this.style('heat', 'width', `${Math.round(s.heat * 100)}%`);
    }
    this.cls('heat', 'pursuit', s.pursuit);

    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0) this.cls('msg', 'show', false);
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.cls('toast', 'show', false);
    }
  }

  /** Grand message central (compte à rebours, BUSTED…). duration ≤ 0 : permanent. */
  message(text: string, duration = 1.2, color = '#fff'): void {
    this.cache.msg = text;
    this.el.msg.textContent = text;
    this.el.msg.style.color = color;
    this.el.msg.classList.remove('show');
    void this.el.msg.offsetWidth; // relance l'animation
    this.el.msg.classList.add('show');
    this.cache['msg.c.show'] = '1';
    this.msgTimer = duration > 0 ? duration : Infinity;
  }

  clearMessage(): void {
    this.msgTimer = 0;
    this.cls('msg', 'show', false);
  }

  /** Fait « sauter » le compteur de score. */
  bumpScore(): void {
    const el = this.el.score.parentElement!;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  /** Petit message (DRIFT, NEAR MISS…). */
  toast(text: string, color = '#ffd23f', duration = 0.9): void {
    if (this.cache.toast === text && this.toastTimer > 0.4) {
      this.toastTimer = 0.9;
      return;
    }
    this.cache.toast = text;
    this.el.toast.textContent = text;
    this.el.toast.style.color = color;
    this.el.toast.classList.remove('show');
    void this.el.toast.offsetWidth;
    this.el.toast.classList.add('show');
    this.cache['toast.c.show'] = '1';
    this.toastTimer = duration;
  }
}
