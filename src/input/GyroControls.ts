/** Direction par inclinaison (téléphone tenu comme un volant, en paysage). */
type OrientationCtor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

export class GyroControls {
  private beta = 0;
  private gamma = 0;
  private hasData = false;
  invert = false;
  /** inclinaison (degrés) pour un braquage complet */
  range = 22;

  constructor() {
    window.addEventListener('deviceorientation', (e) => {
      if (e.beta === null || e.gamma === null) return;
      this.beta = e.beta;
      this.gamma = e.gamma;
      this.hasData = true;
    });
  }

  static get supported(): boolean {
    return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
  }

  static get needsPermission(): boolean {
    const C = (window as unknown as { DeviceOrientationEvent?: OrientationCtor }).DeviceOrientationEvent;
    return !!C && typeof C.requestPermission === 'function';
  }

  /** Doit être appelé depuis un geste utilisateur (iOS). */
  static async requestPermission(): Promise<boolean> {
    const C = (window as unknown as { DeviceOrientationEvent?: OrientationCtor }).DeviceOrientationEvent;
    if (!C) return false;
    if (typeof C.requestPermission !== 'function') return true;
    try {
      return (await C.requestPermission()) === 'granted';
    } catch {
      return false;
    }
  }

  get active(): boolean {
    return this.hasData;
  }

  get steer(): number {
    if (!this.hasData) return 0;
    const angle = screenAngle();
    // En paysage, le « volant » correspond à beta ; son signe dépend du sens de rotation de l'écran.
    let v = angle === 90 ? this.beta : angle === 270 || angle === -90 ? -this.beta : this.gamma;
    if (this.invert) v = -v;
    const s = v / this.range;
    const dead = 0.06;
    if (Math.abs(s) < dead) return 0;
    return Math.max(-1, Math.min(1, (s - Math.sign(s) * dead) / (1 - dead)));
  }
}

function screenAngle(): number {
  const so = screen.orientation as ScreenOrientation | undefined;
  if (so && typeof so.angle === 'number') return so.angle;
  const legacy = (window as unknown as { orientation?: number }).orientation;
  return typeof legacy === 'number' ? legacy : 0;
}
