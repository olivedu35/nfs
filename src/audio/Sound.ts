/** Sons 100 % synthétisés : moteur (oscillateurs), crash (bruit blanc), nitro, sirène. */
export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private engineGain!: GainNode;
  private engOsc1!: OscillatorNode;
  private engOsc2!: OscillatorNode;
  private engFilter!: BiquadFilterNode;
  private sirenGain!: GainNode;
  private sirenOsc!: OscillatorNode;
  private noise!: AudioBuffer;
  private enabled = true;
  private sirenT = 0;

  /** À appeler depuis un geste utilisateur. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.6 : 0;
    this.master.connect(ctx.destination);

    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 900;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engOsc1 = ctx.createOscillator();
    this.engOsc1.type = 'sawtooth';
    this.engOsc2 = ctx.createOscillator();
    this.engOsc2.type = 'square';
    const g2 = ctx.createGain();
    g2.gain.value = 0.35;
    this.engOsc1.connect(this.engFilter);
    this.engOsc2.connect(g2).connect(this.engFilter);
    this.engFilter.connect(this.engineGain).connect(this.master);
    this.engOsc1.start();
    this.engOsc2.start();

    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.connect(this.sirenGain).connect(this.master);
    this.sirenOsc.start();

    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setEnabled(v: boolean): void {
    this.enabled = v;
    if (this.ctx) this.master.gain.setTargetAtTime(v ? 0.6 : 0, this.ctx.currentTime, 0.05);
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** Moteur : régime simulé avec 5 rapports. */
  engine(speedRatio: number, throttle: number, running: boolean): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const gears = 5;
    const g = Math.min(gears - 1, Math.floor(speedRatio * gears));
    const inGear = speedRatio * gears - g;
    const rpm = 0.25 + inGear * 0.65 + g * 0.04;
    const f = 40 + rpm * 120;
    this.engOsc1.frequency.setTargetAtTime(f, t, 0.03);
    this.engOsc2.frequency.setTargetAtTime(f * 0.5, t, 0.03);
    this.engFilter.frequency.setTargetAtTime(500 + throttle * 1400 + rpm * 600, t, 0.05);
    this.engineGain.gain.setTargetAtTime(running ? 0.1 + throttle * 0.12 : 0, t, 0.08);
  }

  siren(on: boolean, proximity: number, dt: number): void {
    if (!this.ctx) return;
    this.sirenT += dt;
    const t = this.ctx.currentTime;
    const hi = Math.floor(this.sirenT * 1.6) % 2 === 0;
    this.sirenOsc.frequency.setTargetAtTime(hi ? 960 : 700, t, 0.02);
    this.sirenGain.gain.setTargetAtTime(on ? 0.03 + proximity * 0.09 : 0, t, 0.1);
  }

  private burst(duration: number, freq: number, q: number, vol: number, type: BiquadFilterType = 'bandpass'): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + duration + 0.05);
  }

  crash(intensity: number): void {
    this.burst(0.25 + intensity * 0.35, 600, 0.6, 0.4 + intensity * 0.6, 'lowpass');
  }

  nitro(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    const t = ctx.currentTime;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(2500, t + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.75);
  }

  beep(high = false): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = high ? 1320 : 660;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (high ? 0.5 : 0.2));
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.55);
  }

  whoosh(): void {
    this.burst(0.25, 1800, 2, 0.25);
  }
}

export function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* non supporté */
  }
}
