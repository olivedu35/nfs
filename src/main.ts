import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { CARS, UPGRADES, UPGRADE_COSTS, UpgradeId } from './config';
import { CHAMP_BONUS, CHAMP_POINTS, Championship } from './game/Championship';
import { Game, RaceResult } from './game/Game';
import { TRACKS, TrackDef, trackById, trackSvg } from './game/tracks';
import { GyroControls } from './input/GyroControls';
import { Save, formatTime } from './storage/Save';
import { qrSvg } from './ui/qr';
import {
  enterFullscreen,
  exitFullscreen,
  fullscreenSupported,
  install,
  isFullscreen,
  isIOS,
  isStandalone,
} from './ui/fullscreen';

registerSW({ immediate: true });

const ui = document.getElementById('ui') as HTMLDivElement;
const canvas = document.getElementById('gl') as HTMLCanvasElement;

// ------------------------------------------------------------ blocages tactiles
const stop = (e: Event): void => e.preventDefault();
// le scroll n'est autorisé que dans les écrans de menu (qui peuvent dépasser sur petit écran)
document.addEventListener(
  'touchmove',
  (e) => {
    if (!(e.target as Element | null)?.closest?.('.screen')) e.preventDefault();
  },
  { passive: false },
);
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

const fmt = (n: number): string => Math.round(n).toLocaleString('fr-FR');

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
      <div class="fs-hint" hidden>Plein écran sur iPhone : <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5"/><path d="M8 10H5.5v10h13V10H16"/></svg> Partager → « Sur l'écran d'accueil »</div>
    </div>`);
  (title.querySelector('.fs-hint') as HTMLElement).hidden = !isIOS || isStandalone();
  ui.appendChild(title);

  // Garage
  const garage = h(`<div class="screen garage" hidden>
      <div class="garage-top">
      <div class="cars"></div>
      <div class="settings">
        <div class="seg" data-set="control">
          <button data-v="buttons">BOUTONS</button><button data-v="gyro">GYROSCOPE</button>
        </div>
        <button class="toggle" data-set="sound"></button>
        <button class="toggle" data-set="invert"></button>
        <div class="fs-row">
          <button class="toggle fs-btn" hidden></button>
          <button class="toggle install-btn" hidden>INSTALLER L'APP</button>
        </div>
        <div class="records"></div>
      </div>
      </div>
      <div class="row">
        <button class="shop-btn">BOUTIQUE · <span class="wallet-n"></span> PTS</button>
        <button class="big go">COURSE ▶</button>
        <button class="big champ-btn">CHAMPIONNAT ★</button>
      </div>
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
    (garage.querySelector('.wallet-n') as HTMLElement).textContent = fmt(Save.wallet);
    refreshFullscreenUi();
    (garage.querySelector('.records') as HTMLElement).innerHTML =
      `RECORD POUBELLES <b>${fmt(Save.bestScore)}</b><br>TITRES DE CHAMPION <b>${Save.champWins}</b>`;
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

  // Plein écran / installation
  const fsBtn = garage.querySelector('.fs-btn') as HTMLButtonElement;
  const installBtn = garage.querySelector('.install-btn') as HTMLButtonElement;
  function refreshFullscreenUi(): void {
    if (isStandalone()) {
      fsBtn.hidden = true;
      installBtn.hidden = true;
      return;
    }
    if (fullscreenSupported()) {
      fsBtn.hidden = false;
      fsBtn.textContent = isFullscreen() ? 'QUITTER PLEIN ÉCRAN' : 'PLEIN ÉCRAN';
    } else {
      // iPhone : impossible depuis Safari → guide d'installation
      fsBtn.hidden = !isIOS;
      fsBtn.textContent = 'PLEIN ÉCRAN ?';
    }
    installBtn.hidden = !install.available;
  }
  document.addEventListener('fullscreenchange', refreshFullscreenUi);
  install.onChange(refreshFullscreenUi);
  fsBtn.addEventListener('click', () => {
    if (!fullscreenSupported()) {
      show(fsHelp);
      return;
    }
    if (isFullscreen()) exitFullscreen();
    else enterFullscreen();
  });
  installBtn.addEventListener('click', () => void install.prompt());

  const fsHelp = h(`<div class="screen overlay fshelp" hidden>
      <h2>JOUER EN PLEIN ÉCRAN</h2>
      <p class="help-lead">Sur iPhone, Safari ne laisse aucun site masquer ses barres.<br>La solution : installer le jeu comme une app.</p>
      <ol class="steps">
        <li><span class="n">1</span>Touchez <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5"/><path d="M8 10H5.5v10h13V10H16"/></svg> <b>Partager</b> dans la barre de Safari</li>
        <li><span class="n">2</span>Choisissez <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8.5v7M8.5 12h7"/></svg> <b>« Sur l'écran d'accueil »</b></li>
        <li><span class="n">3</span>Lancez <b>Night Rush</b> depuis l'icône : plus de barre ni d'onglets !</li>
      </ol>
      <p class="help-note">Sans installer : Réglages → Safari → désactivez « Barre d'onglets en paysage ».<br>
      L'app installée garde sa propre sauvegarde (points et améliorations repartent de zéro).</p>
      <button class="big" data-a="ok">COMPRIS</button>
    </div>`);
  ui.appendChild(fsHelp);
  fsHelp.querySelector('[data-a="ok"]')!.addEventListener('click', () => {
    refreshGarage();
    show(garage);
  });

  // Boutique
  const shop = h(`<div class="screen overlay shop" hidden>
      <div class="shop-head"><button data-a="back">◀ GARAGE</button><h2>BOUTIQUE</h2><div class="wallet"></div></div>
      <div class="shop-list"></div>
    </div>`);
  ui.appendChild(shop);
  const shopList = shop.querySelector('.shop-list') as HTMLDivElement;
  for (const u of UPGRADES) {
    shopList.appendChild(
      h(`<div class="upg" data-id="${u.id}">
        <div class="upg-txt"><b>${u.name}</b><small>${u.desc}</small></div>
        <div class="pips">${UPGRADE_COSTS.map(() => '<i></i>').join('')}</div>
        <button class="buy" data-buy="${u.id}"></button>
      </div>`),
    );
  }
  const refreshShop = (): void => {
    (shop.querySelector('.wallet') as HTMLElement).innerHTML = `<span class="bin-ico"></span>${fmt(Save.wallet)} PTS`;
    shopList.querySelectorAll<HTMLElement>('.upg').forEach((row) => {
      const id = row.dataset.id as UpgradeId;
      const lvl = Save.level(id);
      row.querySelectorAll('.pips i').forEach((p, i) => p.classList.toggle('on', i < lvl));
      const btn = row.querySelector('.buy') as HTMLButtonElement;
      const cost = Save.nextCost(id);
      btn.textContent = cost === null ? 'MAX' : fmt(cost);
      btn.disabled = cost === null || Save.wallet < cost;
      row.classList.toggle('maxed', cost === null);
    });
  };
  shopList.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-buy]');
    if (!btn || btn.disabled) return;
    if (!Save.buy(btn.dataset.buy as UpgradeId)) return;
    game.sound.unlock();
    game.sound.clang(3);
    const row = btn.closest('.upg') as HTMLElement;
    row.classList.remove('bought');
    void row.offsetWidth;
    row.classList.add('bought');
    refreshShop();
  });
  let shopReturn: HTMLElement = garage;
  shop.querySelector('[data-a="back"]')!.addEventListener('click', () => {
    refreshGarage();
    show(shopReturn);
  });
  const openShop = (from: HTMLElement = garage): void => {
    shopReturn = from;
    (shop.querySelector('[data-a="back"]') as HTMLElement).textContent = from === garage ? '◀ GARAGE' : '◀ RETOUR';
    refreshShop();
    show(shop);
  };
  garage.querySelector('.shop-btn')!.addEventListener('click', () => openShop(garage));

  // Choix du circuit (course simple)
  const trackCard = (t: TrackDef, extra: string, tag: 'button' | 'div' = 'button'): string => {
    const strip = `#${t.theme.strip.toString(16).padStart(6, '0')}`;
    return `<${tag} class="track-card" data-id="${t.id}" style="--c:${strip}">
        ${trackSvg(t, strip)}
        <b>${t.name}</b><small>${t.subtitle}</small><small class="tc-extra">${extra}</small>
      </${tag}>`;
  };
  const tracksel = h(`<div class="screen overlay tracksel" hidden>
      <div class="shop-head"><button data-a="back">◀ GARAGE</button><h2>CIRCUIT</h2></div>
      <div class="track-cards"></div>
    </div>`);
  ui.appendChild(tracksel);
  const refreshTracks = (): void => {
    (tracksel.querySelector('.track-cards') as HTMLElement).innerHTML = TRACKS.map((t) =>
      trackCard(t, `${t.laps} TOURS · RECORD ${formatTime(Save.bestRace(t.id))}`),
    ).join('');
  };
  tracksel.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-a="back"]')) {
      refreshGarage();
      show(garage);
      return;
    }
    const card = target.closest<HTMLElement>('.track-card');
    if (!card) return;
    champ.stop();
    lastTrack = trackById(card.dataset.id!);
    startRace(lastTrack);
  });

  // Championnat
  const champ = new Championship();
  const champIntro = h(`<div class="screen overlay champintro" hidden>
      <div class="shop-head"><button data-a="back">◀ GARAGE</button><h2>CHAMPIONNAT</h2></div>
      <div class="track-cards"></div>
      <div class="champ-rules">POINTS ${CHAMP_POINTS.join(' / ')} · PRIME DU CHAMPION <b>${fmt(CHAMP_BONUS[0])} PTS</b></div>
      <button class="big" data-a="go">C'EST PARTI ▶</button>
    </div>`);
  ui.appendChild(champIntro);
  (champIntro.querySelector('.track-cards') as HTMLElement).innerHTML = TRACKS.map((t, i) =>
    trackCard(t, `MANCHE ${i + 1} · ${t.laps} TOURS`, 'div'),
  ).join('');
  champIntro.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
    if (a === 'back') {
      refreshGarage();
      show(garage);
    } else if (a === 'go') {
      champ.start();
      startChampRound();
    }
  });
  const startChampRound = (): void => {
    startRace(champ.track, `MANCHE ${champ.round + 1}/${champ.total} · ${champ.track.name}`);
  };

  // Podium final du championnat
  const final = h(`<div class="screen overlay final" hidden>
      <h2 class="final-title"></h2>
      <table class="standings champ-final"></table>
      <div class="res-info final-info"></div>
      <div class="row">
        <button class="big" data-a="menu">GARAGE</button>
        <button class="shop-btn" data-a="shop">BOUTIQUE</button>
      </div>
    </div>`);
  ui.appendChild(final);
  final.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
    if (a === 'menu') {
      refreshGarage();
      show(garage);
    } else if (a === 'shop') openShop(garage);
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
      <div class="res-sub"></div>
      <div class="res-cols">
        <table class="standings race-table"></table>
        <table class="standings champ-table"></table>
      </div>
      <div class="res-info"></div>
      <div class="row">
        <button class="big" data-a="replay">REJOUER</button>
        <button class="big" data-a="next">MANCHE SUIVANTE ▶</button>
        <button class="shop-btn" data-a="shop">BOUTIQUE</button>
        <button data-a="menu">GARAGE</button>
      </div>
    </div>`);
  ui.appendChild(results);

  const show = (el: HTMLElement | null): void => {
    for (const s of [title, garage, shop, tracksel, champIntro, final, pause, results, fsHelp]) s.hidden = s !== el;
  };

  /** Geste utilisateur : audio + plein écran (retenté à chaque départ, au cas où on en serait sorti). */
  const unlock = (): void => {
    game.sound.unlock();
    enterFullscreen();
  };

  // « click » (et non pointerup) : sinon le clic synthétisé traverse vers le garage
  title.addEventListener('click', () => {
    unlock();
    refreshGarage();
    show(garage);
  });

  let lastTrack: TrackDef = TRACKS[0];
  const startRace = (def: TrackDef, banner?: string): void => {
    unlock();
    show(null);
    game.onEnd = onEnd;
    game.startRace(Save.settings.car, def, banner);
  };
  /** Relance la course en cours (pause → recommencer, ou rejouer). */
  const restart = (): void => {
    if (champ.active) startChampRound();
    else startRace(lastTrack);
  };
  garage.querySelector('.go')!.addEventListener('click', () => {
    refreshTracks();
    show(tracksel);
  });
  garage.querySelector('.champ-btn')!.addEventListener('click', () => show(champIntro));

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
      restart();
    } else if (a === 'menu') {
      game.setPaused(false);
      champ.stop(); // quitter en pleine course abandonne le championnat
      game.quitToTitle();
      refreshGarage();
      show(garage);
    }
  });
  results.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
    if (a === 'replay') restart();
    else if (a === 'next') {
      if (champ.isLastRound) showFinal();
      else {
        champ.next();
        startChampRound();
      }
    } else if (a === 'shop') {
      openShop(results); // on peut dépenser entre deux manches
    } else if (a === 'menu') {
      champ.stop();
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
    if (champ.active) champ.record(r);
    (results.querySelector('.res-sub') as HTMLElement).textContent = champ.active
      ? `CHAMPIONNAT · MANCHE ${champ.round + 1}/${champ.total} · ${r.trackName}`
      : r.trackName;
    (results.querySelector('.race-table') as HTMLElement).innerHTML = r.standings
      .map(
        (s, i) => `<tr class="${s.player ? 'me' : ''}">
          <td>${s.time === null ? '—' : i + 1}</td>
          <td><i style="background:${s.color}"></i>${s.name}</td>
          <td>${s.time === null ? (s.player ? 'ARRÊTÉ' : '—') : (s.estimated ? '~' : '') + formatTime(s.time)}</td>
          ${champ.active ? `<td class="gain">+${CHAMP_POINTS[i] ?? 0}</td>` : ''}
        </tr>`,
      )
      .join('');
    const champTable = results.querySelector('.champ-table') as HTMLElement;
    champTable.hidden = !champ.active;
    if (champ.active) {
      champTable.innerHTML =
        `<caption>GÉNÉRAL</caption>` +
        champ
          .standings()
          .map(
            (c, i) => `<tr class="${c.player ? 'me' : ''}"><td>${i + 1}</td>
              <td><i style="background:${c.color}"></i>${c.name}</td><td>${c.points} PTS</td></tr>`,
          )
          .join('');
    }
    (results.querySelector('[data-a="replay"]') as HTMLElement).hidden = champ.active;
    const nextBtn = results.querySelector('[data-a="next"]') as HTMLElement;
    nextBtn.hidden = !champ.active;
    nextBtn.textContent = champ.isLastRound ? 'PODIUM ▶' : 'MANCHE SUIVANTE ▶';
    const binsLine =
      `POUBELLES <b>${r.bins}</b>${r.wrecks ? ` · POLICES KO <b>${r.wrecks}</b>` : ''}` +
      ` · SCORE <b>${fmt(r.score)}</b>${r.scoreRecord ? ' <em>RECORD !</em>' : ''}` +
      `<br><span class="earn">+${fmt(r.score)} PTS → PORTEFEUILLE ${fmt(r.wallet)} PTS</span>`;
    (results.querySelector('.res-info') as HTMLElement).innerHTML = r.busted
      ? `Astuce : percutez la police 3 fois à 50 km/h ou plus pour la détruire !<br>${binsLine}`
      : `TEMPS <b>${formatTime(r.time)}</b>${r.record.race ? ' <em>RECORD !</em>' : ''}
         · MEILLEUR TOUR <b>${formatTime(r.bestLap)}</b>${r.record.lap ? ' <em>RECORD !</em>' : ''}
         · RECORD <b>${formatTime(Save.bestRace(r.trackId))}</b><br>${binsLine}`;
    show(results);
  }

  function showFinal(): void {
    const table = champ.standings();
    const place = champ.playerPlace();
    const bonus = CHAMP_BONUS[place - 1] ?? 0;
    champ.stop();
    game.quitToTitle();
    Save.deposit(bonus);
    if (place === 1) Save.addChampWin();
    const t = final.querySelector('.final-title') as HTMLElement;
    t.textContent = place === 1 ? 'CHAMPION !' : `${place}e DU CHAMPIONNAT`;
    t.className = `final-title ${place === 1 ? 'gold' : ''}`;
    (final.querySelector('.champ-final') as HTMLElement).innerHTML = table
      .map(
        (c, i) => `<tr class="${c.player ? 'me' : ''}"><td>${i + 1}</td>
          <td><i style="background:${c.color}"></i>${c.name}</td><td>${c.points} PTS</td></tr>`,
      )
      .join('');
    (final.querySelector('.final-info') as HTMLElement).innerHTML =
      `<span class="earn">PRIME +${fmt(bonus)} PTS → PORTEFEUILLE ${fmt(Save.wallet)} PTS</span>` +
      (place === 1 ? `<br>TITRES DE CHAMPION <b>${Save.champWins}</b>` : '');
    show(final);
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
