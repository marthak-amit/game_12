// Fully procedural audio: no asset files. A look-ahead step sequencer drives a layered
// synthwave loop; gameplay events inject quantised melody notes so every run sounds unique.

const MIN_PENTA = [0, 3, 5, 7, 10];
const BARS = [
  { root: -0, tri: [0, 3, 7] },   // Am
  { root: -4, tri: [0, 4, 7] },   // F
  { root: 3,  tri: [0, 4, 7] },   // C
  { root: -2, tri: [0, 4, 7] },   // G
];
const hz = (base, semi) => base * Math.pow(2, semi / 12);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.bpm = 100;
    this.targetBpm = 100;
    this.intensity = -1;       // -1 menu, 0..3 in-game layers
    this.musicOn = true;
    this.sfxOn = true;
    this.step = 0;
    this.next = 0;
    this.timer = null;
    this.onBeat = null;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = (this.ctx = new AC());
      this.master = c.createGain(); this.master.gain.value = 0.8;
      const comp = c.createDynamicsCompressor();
      this.master.connect(comp); comp.connect(c.destination);
      this.music = c.createGain(); this.music.gain.value = this.musicOn ? 0.55 : 0;
      this.sfx = c.createGain(); this.sfx.gain.value = this.sfxOn ? 0.9 : 0;
      this.music.connect(this.master); this.sfx.connect(this.master);
      // shared echo
      this.echo = c.createDelay(1); this.echo.delayTime.value = 0.28;
      const fb = c.createGain(); fb.gain.value = 0.35;
      const send = (this.echoIn = c.createGain()); send.gain.value = 1;
      send.connect(this.echo); this.echo.connect(fb); fb.connect(this.echo);
      const ef = c.createGain(); ef.gain.value = 0.35;
      this.echo.connect(ef); ef.connect(this.master);
      // noise buffer
      const len = c.sampleRate;
      this.noise = c.createBuffer(1, len, c.sampleRate);
      const ch = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMusic(on) { this.musicOn = on; if (this.music) this.music.gain.value = on ? 0.55 : 0; }
  setSfx(on) { this.sfxOn = on; if (this.sfx) this.sfx.gain.value = on ? 0.9 : 0; }
  setBpm(b) { this.targetBpm = b; }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  start() {
    if (!this.ctx || this.timer) return;
    this.next = this.ctx.currentTime + 0.08;
    this.step = 0;
    this.timer = setInterval(() => this.tick(), 25);
  }
  stop() { clearInterval(this.timer); this.timer = null; }

  tick() {
    const c = this.ctx;
    if (c.state !== 'running') return;
    while (this.next < c.currentTime + 0.14) {
      this.bpm += (this.targetBpm - this.bpm) * 0.02;
      this.schedule(this.step, this.next);
      this.next += 60 / this.bpm / 4;
      this.step = (this.step + 1) % 64;
    }
  }

  schedule(step, t) {
    const s = step % 16;
    const bar = BARS[Math.floor(step / 16) % 4];
    const I = this.intensity;
    if (s % 4 === 0) {
      if (this.onBeat) setTimeout(() => this.onBeat(), Math.max(0, (t - this.ctx.currentTime) * 1000));
      if (I >= 0) this.kick(t);
    }
    if (I >= 0 && s % 4 === 2) this.hat(t, 0.10);
    if (I >= 2 && s % 2 === 1) this.hat(t, 0.04);
    if (I >= 2 && (s === 4 || s === 12)) this.clap(t);
    if (I >= 1 && s % 2 === 0) this.bass(t, hz(55, bar.root + (s % 8 === 6 ? 12 : 0)), 60 / this.bpm / 2 * 0.9);
    if (s === 0) for (const iv of bar.tri) this.pad(t, hz(220, bar.root + iv), (60 / this.bpm) * 4);
    const arpOn = I >= 2 || (I === -1 && s % 4 === 0) || (I >= 0 && s % 2 === 0);
    if (arpOn) {
      const iv = bar.tri[(s >> (I >= 2 ? 0 : 1)) % 3] + (s % 8 >= 4 ? 12 : 0);
      this.pluck(t, hz(440, bar.root + iv), 0.05, I === -1 ? 0.07 : 0.10);
    }
  }

  // ------- instruments
  env(g, t, a, d, peak) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  osc(type, f, t, dur, peak, dest, opts = {}) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    this.env(g, t, opts.a || 0.005, dur, peak);
    let out = o;
    if (opts.lp) {
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = opts.lp; lp.Q.value = opts.q || 1;
      o.connect(lp); out = lp;
    }
    out.connect(g); g.connect(dest);
    if (opts.echo) { const e = c.createGain(); e.gain.value = opts.echo; g.connect(e); e.connect(this.echoIn); }
    o.start(t); o.stop(t + dur + (opts.a || 0.005) + 0.05);
  }
  noiseHit(t, dur, peak, type, freq, dest, to) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; f.type = type; f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    this.env(g, t, 0.003, dur, peak);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t); s.stop(t + dur + 0.05);
  }
  kick(t) { this.osc('sine', 130, t, 0.22, 0.9, this.music, { to: 38 }); }
  hat(t, v) { this.noiseHit(t, 0.05, v, 'highpass', 7000, this.music); }
  clap(t) { this.noiseHit(t, 0.12, 0.22, 'bandpass', 1800, this.music); }
  bass(t, f, d) { this.osc('sawtooth', f, t, d, 0.28, this.music, { lp: 420, q: 4 }); }
  pad(t, f, d) { this.osc('triangle', f, t, d, 0.05, this.music, { a: 0.4 }); }
  pluck(t, f, d, v) { this.osc('square', f, t, d + 0.1, v, this.music, { lp: 2400, echo: 0.4 }); }

  // ------- gameplay events
  /** Melody note from lane position, snapped to the next 16th. */
  note(deg, bright = false) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const i = ((deg % 10) + 10) % 10;
    const semi = MIN_PENTA[i % 5] + 12 * Math.floor(i / 5) + (bright ? 12 : 0);
    const t = Math.max(this.ctx.currentTime, this.next);
    this.osc('square', hz(440, semi), t, 0.18, 0.18, this.sfx, { lp: 3200, echo: 0.6 });
    this.osc('sine', hz(880, semi), t, 0.12, 0.07, this.sfx);
  }
  collect(pitch = 0) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this.osc('sine', hz(1318, MIN_PENTA[pitch % 5]), t, 0.12, 0.2, this.sfx, { echo: 0.3 });
    this.osc('triangle', hz(1976, MIN_PENTA[pitch % 5]), t + 0.04, 0.1, 0.1, this.sfx);
  }
  graze() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this.noiseHit(t, 0.18, 0.18, 'bandpass', 3000, this.sfx, 9000);
    this.osc('sine', 1568, t, 0.14, 0.12, this.sfx, { to: 2637 });
  }
  phase(on) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    if (on) this.noiseHit(t, 0.35, 0.3, 'bandpass', 400, this.sfx, 4000);
    else this.noiseHit(t, 0.25, 0.2, 'bandpass', 4000, this.sfx, 300);
  }
  crash() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this.noiseHit(t, 0.9, 0.7, 'lowpass', 3000, this.sfx, 80);
    this.osc('sawtooth', 220, t, 0.7, 0.4, this.sfx, { to: 30, lp: 800 });
  }
  stageUp() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    [0, 4, 7, 12].forEach((s, i) => this.osc('square', hz(523, s), t + i * 0.07, 0.25, 0.14, this.sfx, { lp: 3000, echo: 0.5 }));
  }
  reward() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    [0, 4, 7, 12, 16].forEach((s, i) => this.osc('triangle', hz(659, s), t + i * 0.06, 0.3, 0.16, this.sfx, { echo: 0.4 }));
  }
  tap() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this.osc('sine', 880, t, 0.06, 0.12, this.sfx, { to: 1320 });
  }
  swish() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this.noiseHit(t, 0.09, 0.08, 'bandpass', 2400, this.sfx, 5000);
  }
}
