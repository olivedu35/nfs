import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { CARS } from './config';
import { Game, RaceResult } from './game/Game';
import { GyroControls } from './input/GyroControls';
import { Save, formatTime } from './storage/Save';
import { qrSvg } from './ui/qr';

registerSW({ immediate: true });

const ui = document.getElementById('ui') as HTMLDivElement;
const canvas = document.getElementById('gl') as HTMLCanvasElement;

// ------------------------------------------------------------ blocages tactiles
const stop = (e: Event): void => e.preventDefault();
document.addEventListener('touchmove', stop, { passive: false });
document.addEventListener('gesturestart', stop);
document.addEventListener('gesturechange', stop);
document.addEventListener('dblclick', stop);
document.addEventListener('contextmenu', stop);
let lastTouchEnd = 0;
document.addEventListener(
  'touchend',
  (e) => {
    const now = Date.now();
    if (now - lastTouchEnd < 300) e.preventDefault(); // anti double-tap zoom
    lastTouchEnd = now;
  },
  { passive: false },
);

// ------------------------------------------------------------ desktop
function isMobile(): boolean {
  if (new URLSearchParams(location.search).has('play')) return true;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const ua = navigator.userAgent;
  const mobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const iPadOs = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  return (coarse && navigator.maxTouchPoints > 0) || mobileUa || iPadOs;
}

function h(html: string): HTMLDivElement {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstElementChild as HTMLDivElement;
}

if (!isMobile()) {
  canvas.remove();
  const url = location.origin + location.pathname;
  ui.appendChild(
    h(`<div class="screen desktop">
      <h1 class="logo">NIGHT<span>RUSH</span></h1>
      <p>Jeu conçu pour mobile — scannez ce QR code</p>
      <div class="qr">${qrSvg(url, 220)}</div>
      <p class="small">${url}</p>
    </div>`),
  );
} else {
  boot();
}

// ------------------------------------------------------------ jeu
function boot(): void {
  const game = new Game(canvas, ui);
  game.applySettings(Save.settings);
  if (new URLSearchParams(location.search).has('debug')) (window as unknown as { game: Game }).game = game;

  const rotate = h(`<div class="rotate"><div class="phone"></div><p>Tournez votre téléphone</p></div>`);
  ui.appendChild(rotate);

  // Écran titre
  const title = h(`<div class="screen title">
      <h1 class="logo">NIGHT<span>RUSH</span></h1>
      <div class="blink">TAP TO START</div>
    </div>`);
  ui.appendChild(title);

  // Garage
  const garage = h(`<div class="screen garage" hidden>
      <div class="cars"></div>
      <div class="settings">
        <div class="seg" data-set="control">
          <button data-v="buttons">BOUTONS</button><button data-v="gyro">GYROSCOPE</button>
        </div>
        <button class="toggle" data-set="sound"></button>
        <button class="toggle" data-set="invert"></button>
        <div class="records"></div>
      </div>
      <button class="big go">COURSE ▶</button>
      <div class="note" hidden></div>
    </div>`);
  ui.appendChild(garage);
  const carsEl = garage.querySelector('.cars') as HTMLDivElement;
  const bar = (v: number): string => `<div class="stat"><i style="width:${Math.round(v * 100)}%"></i></div>`;
  CARS.forEach((c, i) => {
    const hex = `#${c.color.toString(16).padStart(6, '0')}`;
    carsEl.appendChild(
      h(`<button class="car" data-i="${i}" style="--c:${hex}">
        <div class="swatch"></div>
        <b>${c.name}</b>
        <label>VITESSE</label>${bar(c.stats.speed)}
        <label>ACCÉL.</label>${bar(c.stats.accel)}
        <label>MANIA.</label>${bar(c.stats.handling)}
      </button>`),
    );
  });
  const note = garage.querySelector('.note') as HTMLDivElement;

  const refreshGarage = (): void => {
    const s = Save.settings;
    carsEl.querySelectorAll<HTMLElement>('.car').forEach((el) => {
      el.classList.toggle('sel', Number(el.dataset.i) === s.car);
    });
    garage.querySelectorAll<HTMLElement>('.seg button').forEach((b) => {
      b.classList.toggle('sel', b.dataset.v === s.control);
    });
    (garage.querySelector('[data-set="sound"]') as HTMLElement).textContent = `SON : ${s.sound ? 'ON' : 'OFF'}`;
    const inv = garage.querySelector('[data-set="invert"]') as HTMLElement;
    inv.textContent = `INVERSER GYRO : ${s.gyroInvert ? 'OUI' : 'NON'}`;
    inv.hidden = s.control !== 'gyro';
    (garage.querySelector('.records') as HTMLElement).innerHTML =
      `RECORD COURSE <b>${formatTime(Save.bestRace)}</b><br>MEILLEUR TOUR <b>${formatTime(Save.bestLap)}</b>`;
    game.applySettings(s);
  };

  carsEl.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('.car');
    if (!el) return;
    Save.setSettings({ car: Number(el.dataset.i) });
    refreshGarage();
  });
  garage.querySelectorAll<HTMLButtonElement>('.seg button').forEach((b) => {
    b.addEventListener('click', async () => {
      if (b.dataset.v === 'gyro') {
        // iOS exige une demande explicite depuis un geste utilisateur
        const ok = GyroControls.supported && (await GyroControls.requestPermission());
        if (!ok) {
          note.textContent = 'Gyroscope indisponible ou refusé — boutons conservés.';
          note.hidden = false;
          Save.setSettings({ control: 'buttons' });
          refreshGarage();
          return;
        }
        note.hidden = true;
        Save.setSettings({ control: 'gyro' });
      } else {
        Save.setSettings({ control: 'buttons' });
      }
      refreshGarage();
    });
  });
  garage.querySelector('[data-set="sound"]')!.addEventListener('click', () => {
    Save.setSettings({ sound: !Save.settings.sound });
    refreshGarage();
  });
  garage.querySelector('[data-set="invert"]')!.addEventListener('click', () => {
    Save.setSettings({ gyroInvert: !Save.settings.gyroInvert });
    refreshGarage();
  });

  // Pause
  const pause = h(`<div class="screen overlay pause-screen" hidden>
      <h2>PAUSE</h2>
      <button class="big" data-a="resume">REPRENDRE</button>
      <button data-a="restart">RECOMMENCER</button>
      <button data-a="menu">GARAGE</button>
    </div>`);
  ui.appendChild(pause);

  // Résultats
  const results = h(`<div class="screen overlay results" hidden>
      <h2 class="res-title"></h2>
      <table class="standings"></table>
      <div class="res-info"></div>
      <div class="row">
        <button class="big" data-a="replay">REJOUER</button>
        <button data-a="menu">GARAGE</button>
      </div>
    </div>`);
  ui.appendChild(results);

  const show = (el: HTMLElement | null): void => {
    for (const s of [title, garage, pause, results]) s.hidden = s !== el;
  };

  let unlocked = false;
  const unlock = (): void => {
    game.sound.unlock();
    if (unlocked) return;
    unlocked = true;
    const de = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    try {
      if (de.requestFullscreen) {
        de.requestFullscreen({ navigationUI: 'hide' })
          .then(() => {
            const so = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
            return so.lock?.('landscape');
          })
          .catch(() => undefined);
      } else {
        de.webkitRequestFullscreen?.();
      }
    } catch {
      /* fullscreen non supporté (iPhone) */
    }
  };

  // « click » (et non pointerup) : sinon le clic synthétisé traverse vers le garage
  title.addEventListener('click', () => {
    unlock();
    refreshGarage();
    show(garage);
  });

  const start = (): void => {
    unlock();
    show(null);
    game.onEnd = onEnd;
    game.startRace(Save.settings.car);
  };
  garage.querySelector('.go')!.addEventListener('click', start);

  game.hud.pauseBtn.addEventListener('click', () => {
    if (game.state === 'idle') return;
    game.setPaused(true);
    show(pause);
  });
  pause.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
    if (a === 'resume') {
      game.setPaused(false);
      show(null);
    } else if (a === 'restart') {
      game.setPaused(false);
      start();
    } else if (a === 'menu') {
      game.setPaused(false);
      game.quitToTitle();
      refreshGarage();
      show(garage);
    }
  });
  results.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
    if (a === 'replay') start();
    else if (a === 'menu') {
      game.quitToTitle();
      refreshGarage();
      show(garage);
    }
  });

  function onEnd(r: RaceResult): void {
    game.touch.show(false);
    const t = results.querySelector('.res-title') as HTMLElement;
    t.textContent = r.busted ? 'BUSTED' : r.position === 1 ? 'VICTOIRE !' : `${r.position}e PLACE`;
    t.className = `res-title ${r.busted ? 'bad' : r.position === 1 ? 'gold' : ''}`;
    (results.querySelector('.standings') as HTMLElement).innerHTML = r.standings
      .map(
        (s, i) => `<tr class="${s.player ? 'me' : ''}">
          <td>${s.time === null ? '—' : i + 1}</td>
          <td><i style="background:${s.color}"></i>${s.name}</td>
          <td>${s.time === null ? (s.player ? 'ARRÊTÉ' : '—') : (s.estimated ? '~' : '') + formatTime(s.time)}</td>
        </tr>`,
      )
      .join('');
    (results.querySelector('.res-info') as HTMLElement).innerHTML = r.busted
      ? 'La police vous a coincé. Roulez moins vite… ou semez-les à la nitro !'
      : `TEMPS <b>${formatTime(r.time)}</b>${r.record.race ? ' <em>NOUVEAU RECORD !</em>' : ''}<br>
         MEILLEUR TOUR <b>${formatTime(r.bestLap)}</b>${r.record.lap ? ' <em>RECORD !</em>' : ''}<br>
         RECORD COURSE <b>${formatTime(Save.bestRace)}</b>`;
    show(results);
  }

  // Pause auto : onglet masqué ou passage en portrait
  const portrait = window.matchMedia('(orientation: portrait)');
  const autoPause = (): void => {
    if ((document.hidden || portrait.matches) && (game.state === 'race' || game.state === 'countdown') && !game.paused) {
      game.setPaused(true);
      show(pause);
    }
    if (document.hidden) game.sound.suspend();
  };
  document.addEventListener('visibilitychange', autoPause);
  portrait.addEventListener('change', () => {
    autoPause();
    setTimeout(() => game.resize(), 250);
  });

  show(title);
}
