import { Track } from '../game/Track';

export interface MapDot {
  x: number;
  z: number;
  color: string;
  size: number;
}

/** Mini-map 2D : le tracé est pré-rendu une fois, seuls les points sont redessinés. */
export class Minimap {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement;
  private scale = 1;
  private ox = 0;
  private oz = 0;
  private readonly size = 130;
  private readonly dpr = Math.min(window.devicePixelRatio || 1, 2);

  constructor(parent: HTMLElement, private track: Track) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'minimap';
    const px = this.size * this.dpr;
    this.canvas.width = this.canvas.height = px;
    parent.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.bg = document.createElement('canvas');
    this.bg.width = this.bg.height = px;
    this.prerender();
  }

  /** Le nord de la carte = -z ; on inverse x pour garder la gauche/droite naturelles vues du dessus. */
  private map(x: number, z: number): [number, number] {
    return [(this.ox - x) * this.scale, (this.oz - z) * this.scale];
  }

  private prerender(): void {
    const t = this.track;
    const px = this.size * this.dpr;
    const pad = 10 * this.dpr;
    const w = t.maxX - t.minX, h = t.maxZ - t.minZ;
    this.scale = (px - pad * 2) / Math.max(w, h);
    this.ox = t.maxX + ((px - pad * 2) / this.scale - w) / 2 + pad / this.scale;
    this.oz = t.maxZ + ((px - pad * 2) / this.scale - h) / 2 + pad / this.scale;
    const c = this.bg.getContext('2d')!;
    c.lineJoin = 'round';
    c.beginPath();
    for (let i = 0; i <= t.n; i += 3) {
      const k = i % t.n;
      const [x, y] = this.map(t.px[k], t.pz[k]);
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.closePath();
    c.strokeStyle = 'rgba(255,255,255,0.25)';
    c.lineWidth = 7 * this.dpr;
    c.stroke();
    c.strokeStyle = 'rgba(200,210,255,0.85)';
    c.lineWidth = 2.5 * this.dpr;
    c.stroke();
    // ligne d'arrivée
    const [sx, sy] = this.map(t.px[0], t.pz[0]);
    c.fillStyle = '#fff';
    c.fillRect(sx - 3 * this.dpr, sy - 3 * this.dpr, 6 * this.dpr, 6 * this.dpr);
  }

  draw(dots: MapDot[]): void {
    const c = this.ctx;
    const px = this.size * this.dpr;
    c.clearRect(0, 0, px, px);
    c.drawImage(this.bg, 0, 0);
    for (const d of dots) {
      const [x, y] = this.map(d.x, d.z);
      c.beginPath();
      c.arc(x, y, d.size * this.dpr, 0, Math.PI * 2);
      c.fillStyle = d.color;
      c.fill();
      if (d.size > 3) {
        c.lineWidth = 1.5 * this.dpr;
        c.strokeStyle = '#000';
        c.stroke();
      }
    }
  }
}
