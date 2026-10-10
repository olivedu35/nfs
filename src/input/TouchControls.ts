/** Boutons tactiles multi-touch : chaque doigt est testé contre tous les boutons à chaque mouvement,
 *  ce qui permet de glisser de ◀ à ▶ sans relever le doigt. */
export type ButtonId = 'left' | 'right' | 'gas' | 'brake' | 'nitro';

export class TouchControls {
  readonly root: HTMLDivElement;
  private buttons = new Map<ButtonId, HTMLElement>();
  private pressed = new Set<ButtonId>();
  private rects = new Map<ButtonId, DOMRect>();
  onPress: ((id: ButtonId) => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'controls';
    this.root.innerHTML = `
      <div class="pad pad-left">
        <div class="btn steer" data-id="left">◀</div>
        <div class="btn steer" data-id="right">▶</div>
      </div>
      <div class="pad pad-right">
        <div class="btn nitro" data-id="nitro">NITRO</div>
        <div class="btn brake" data-id="brake">FREIN</div>
        <div class="btn gas" data-id="gas">GAZ</div>
      </div>`;
    parent.appendChild(this.root);
    this.root.querySelectorAll<HTMLElement>('.btn').forEach((el) => {
      this.buttons.set(el.dataset.id as ButtonId, el);
    });
    const handler = (e: TouchEvent): void => {
      e.preventDefault();
      this.refresh(e.touches);
    };
    for (const ev of ['touchstart', 'touchmove', 'touchend', 'touchcancel'] as const) {
      this.root.addEventListener(ev, handler, { passive: false });
    }
    window.addEventListener('resize', () => this.measure());
    window.addEventListener('blur', () => this.clear());
  }

  setSteerVisible(v: boolean): void {
    this.buttons.get('left')!.style.visibility = v ? 'visible' : 'hidden';
    this.buttons.get('right')!.style.visibility = v ? 'visible' : 'hidden';
    this.measure();
  }

  show(v: boolean): void {
    this.root.hidden = !v;
    if (v) requestAnimationFrame(() => this.measure());
    else this.clear();
  }

  measure(): void {
    for (const [id, el] of this.buttons) this.rects.set(id, el.getBoundingClientRect());
  }

  private refresh(touches: TouchList): void {
    if (this.rects.size === 0) this.measure();
    const now = new Set<ButtonId>();
    for (let i = 0; i < touches.length; i++) {
      const t = touches[i];
      for (const [id, r] of this.rects) {
        if (r.width === 0) continue;
        // marge de tolérance de 12 px autour de chaque bouton
        if (t.clientX >= r.left - 12 && t.clientX <= r.right + 12 && t.clientY >= r.top - 12 && t.clientY <= r.bottom + 12) {
          if (this.buttons.get(id)!.style.visibility === 'hidden') continue;
          now.add(id);
          break;
        }
      }
    }
    for (const id of now) if (!this.pressed.has(id)) this.onPress?.(id);
    this.pressed = now;
    for (const [id, el] of this.buttons) el.classList.toggle('on', now.has(id));
  }

  clear(): void {
    this.pressed.clear();
    for (const el of this.buttons.values()) el.classList.remove('on');
  }

  is(id: ButtonId): boolean {
    return this.pressed.has(id);
  }

  get steer(): number {
    return (this.is('right') ? 1 : 0) - (this.is('left') ? 1 : 0);
  }
}
