/** Plein écran, installation PWA et détection de plateforme. */

type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitFullscreenEnabled?: boolean };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void };

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const ua = navigator.userAgent;
/** iPhone / iPod, ou iPad qui se présente comme un Mac. */
export const isIOS = /iPhone|iPod|iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
export const isIPhone = /iPhone|iPod/.test(ua);

/** Lancé depuis l'écran d'accueil (PWA installée) : pas de barre du navigateur. */
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** L'API Fullscreen est utilisable (Android, iPad ; jamais sur iPhone). */
export function fullscreenSupported(): boolean {
  const d = document as FsDoc;
  return !!(d.fullscreenEnabled || d.webkitFullscreenEnabled) && !isIPhone;
}

export function isFullscreen(): boolean {
  const d = document as FsDoc;
  return !!(d.fullscreenElement || d.webkitFullscreenElement);
}

/** À appeler depuis un geste utilisateur. Verrouille aussi le paysage quand c'est possible. */
export function enterFullscreen(): void {
  if (isStandalone() || isFullscreen() || !fullscreenSupported()) return;
  const el = document.documentElement as FsEl;
  try {
    if (el.requestFullscreen) {
      el.requestFullscreen({ navigationUI: 'hide' })
        .then(() => {
          const so = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
          return so.lock?.('landscape');
        })
        .catch(() => undefined);
    } else {
      el.webkitRequestFullscreen?.();
    }
  } catch {
    /* refusé par le navigateur */
  }
}

export function exitFullscreen(): void {
  if (isFullscreen()) void document.exitFullscreen?.().catch(() => undefined);
}

// Invite d'installation (Chrome Android) : on la garde pour un bouton « INSTALLER »
let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as InstallPrompt;
  listeners.forEach((f) => f());
});
window.addEventListener('appinstalled', () => {
  deferred = null;
  listeners.forEach((f) => f());
});

export const install = {
  get available(): boolean {
    return deferred !== null;
  },
  onChange(f: () => void): void {
    listeners.add(f);
  },
  async prompt(): Promise<void> {
    if (!deferred) return;
    const p = deferred;
    deferred = null;
    await p.prompt();
    listeners.forEach((f) => f());
  },
};
