// Procedural ambience + glassy SFX. No audio files. Calm drifting pads and soft arpeggios.
const PENTA = [0, 2, 4, 7, 9];                 // major pentatonic
const CHORDS = [[0, 4, 7], [-3, 0, 4], [-5, -1, 2], [-7, -3, 0]];  // C, Am, G/B-ish, F
const hz = (semi, base = 261.63) => base * Math.pow(2, semi / 12);

export class AudioEngine {
  constructor() { this.ctx = null; this.musicOn = true; this.sfxOn = true; this.timer = null; this.bar = 0; this.mood = 0; }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const c = (this.ctx = new AC());
      const comp = c.createDynamicsCompressor(); comp.connect(c.destination);
      this.master = c.createGain(); this.master.gain.value = 0.85; this.master.connect(comp);
      this.music = c.createGain(); this.music.gain.value = this.musicOn ? 0.5 : 0; this.music.connect(this.master);
      this.sfx = c.createGain(); this.sfx.gain.value = this.sfxOn ? 0.9 : 0; this.sfx.connect(this.master);
      // reverb-ish echo
      this.echo = c.createDelay(1); this.echo.delayTime.value = 0.37;
      const fb = c.createGain(); fb.gain.value = 0.42; this.echoIn = c.createGain();
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
      this.echoIn.connect(this.echo); this.echo.connect(lp); lp.connect(fb); fb.connect(this.echo);
      const wet = c.createGain(); wet.gain.value = 0.45; lp.connect(wet); wet.connect(this.master);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  setMusic(on) { this.musicOn = on; if (this.music) this.music.gain.value = on ? 0.5 : 0; }
  setSfx(on) { this.sfxOn = on; if (this.sfx) this.sfx.gain.value = on ? 0.9 : 0; }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  start() {
    if (!this.ctx || this.timer) return;
    this.bar = 0; this.playBar();
    this.timer = setInterval(() => this.playBar(), 6000);
  }
  playBar() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const c = this.ctx, t = c.currentTime + 0.05, ch = CHORDS[this.bar++ % 4];
    for (const iv of ch) this.tone('sine', hz(iv - 12), t, 6.2, 0.07, this.music, { a: 1.8 });
    this.tone('triangle', hz(ch[0] - 24), t, 6, 0.09, this.music, { a: 1.2 });
    for (let i = 0; i < 8; i++) {
      if (Math.random() < 0.7) {
        const n = PENTA[Math.floor(Math.random() * 5)] + (Math.random() < 0.4 ? 12 : 0) + ch[0];
        this.tone('sine', hz(n + 12), t + i * 0.75 + Math.random() * 0.1, 1.6, 0.05, this.music, { echo: 0.6 });
      }
    }
  }

  tone(type, f, t, dur, peak, dest, o = {}) {
    const c = this.ctx, osc = c.createOscillator(), g = c.createGain();
    osc.type = type; osc.frequency.setValueAtTime(f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    const a = o.a || 0.008;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dur);
    osc.connect(g); g.connect(dest);
    if (o.echo) { const e = c.createGain(); e.gain.value = o.echo; g.connect(e); e.connect(this.echoIn); }
    osc.start(t); osc.stop(t + a + dur + 0.05);
  }

  // ---- sfx
  tap(depth = 0) {                       // glass click, pitch rises with moves
    if (!this.ctx) return; const t = this.ctx.currentTime;
    const n = PENTA[depth % 5] + 12 * Math.floor(depth / 5 % 2);
    this.tone('triangle', hz(n + 24), t, 0.12, 0.2, this.sfx, { echo: 0.35 });
    this.tone('sine', hz(n + 36), t, 0.08, 0.08, this.sfx);
  }
  beam() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this.tone('sine', 300, t, 0.25, 0.05, this.sfx, { to: 900 });
  }
  lit(i = 0) {                           // target ignites
    if (!this.ctx) return; const t = this.ctx.currentTime;
    const n = PENTA[i % 5] + 12 * (1 + Math.floor(i / 5));
    this.tone('sine', hz(n + 12), t, 0.7, 0.2, this.sfx, { echo: 0.7 });
    this.tone('triangle', hz(n + 24), t + 0.03, 0.4, 0.07, this.sfx, { echo: 0.5 });
  }
  win() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => this.tone('sine', hz(s + 12), t + i * 0.09, 0.9, 0.17, this.sfx, { echo: 0.7 }));
    this.tone('triangle', hz(-12), t, 1.6, 0.14, this.sfx);
  }
  hint() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    [12, 19].forEach((s, i) => this.tone('sine', hz(s + 12), t + i * 0.12, 0.5, 0.16, this.sfx, { echo: 0.6 }));
  }
  ui() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this.tone('sine', 760, t, 0.07, 0.1, this.sfx, { to: 1100 });
  }
  reward() { this.win(); }
}
