// PULSE RIFT core: a rhythm-synced gravity-shift runner inside an octagonal tunnel.
// World model: the orb sits at z=0 on a ring; the tunnel scrolls toward +z. `dist` is how
// far we have travelled; an object authored at distance d sits at z = dist - d.
import * as THREE from '../vendor/three.module.min.js';
import { CFG, SKINS, STAGE_HUES } from './config.js';

const TAU = Math.PI * 2;
const L = CFG.lanes;
const STEP = TAU / L;
const A = CFG.apothem;
const VERT_R = A / Math.cos(Math.PI / L);        // octagon corner radius
const mod = (n, m) => ((n % m) + m) % m;
const circ = (a, b) => { const d = mod(a - b, L); return d > L / 2 ? d - L : d; }; // signed lane distance
const polar = (a, r) => [Math.sin(a) * r, -Math.cos(a) * r];
const rand = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function makeDot() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Game {
  constructor(container, audio, hooks = {}) {
    this.audio = audio;
    this.hooks = hooks;           // onFrame, onDead, onStage, onEvent
    this.container = container;
    this.state = 'idle';          // idle | play | dying | dead | paused
    this.quality = 1;
    this.fpsAcc = 0; this.fpsN = 0; this.lowFpsTime = 0;

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
    this.pixelCap = Math.min(window.devicePixelRatio || 1, 2);
    r.setPixelRatio(this.pixelCap);
    container.appendChild(r.domElement);

    this.dot = makeDot();
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x05010f, 0.0105);
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.1, 400);
    this.camera.rotation.order = 'ZXY';

    this.buildTunnel();
    this.buildPlayer();
    this.buildPools();
    this.resize();
    window.addEventListener('resize', () => this.resize());

    this.hue = STAGE_HUES[0]; this.targetHue = this.hue;
    this.pulse = 0; this.shake = 0; this.fov = 72; this.timeScale = 1;
    this.dist = 0; this.va = 0; this.ca = 0; this.laneIdx = 0;
    this.reset();
    this.setSkin('nova');
    this.last = performance.now();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  // ---------------------------------------------------------------- scene construction
  buildTunnel() {
    // Rings
    const pts = [];
    for (let k = 0; k < L; k++) { const [x, y] = polar((k + 0.5) * STEP, VERT_R); pts.push(new THREE.Vector3(x, y, 0)); }
    this.ringGeo = new THREE.BufferGeometry().setFromPoints(pts);
    this.ringMatA = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
    this.ringMatB = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 });
    this.ringCount = 36; this.ringGap = 8;
    this.rings = [];
    for (let i = 0; i < this.ringCount; i++) {
      const m = new THREE.LineLoop(this.ringGeo, i % 4 === 0 ? this.ringMatA : this.ringMatB);
      this.scene.add(m); this.rings.push(m);
    }
    // Longitudinal corner lines
    const lp = [];
    for (let k = 0; k < L; k++) {
      const [x, y] = polar((k + 0.5) * STEP, VERT_R);
      lp.push(x, y, 12, x, y, -320);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    this.cornerMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });
    this.scene.add(new THREE.LineSegments(lg, this.cornerMat));
    // Lane panels (current lane glows)
    this.panels = [];
    const pg = new THREE.PlaneGeometry(A * 2 * Math.tan(Math.PI / L) * 0.98, 330);
    pg.rotateX(-Math.PI / 2); pg.translate(0, 0, -150);
    for (let k = 0; k < L; k++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.04, side: THREE.DoubleSide, depthWrite: false });
      const m = new THREE.Mesh(pg, mat);
      const [x, y] = polar(k * STEP, A);
      m.position.set(x, y, 0); m.rotation.z = k * STEP;
      this.scene.add(m); this.panels.push(m);
    }
    // Speed dust
    const n = 220, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) this.placeDust(arr, i, true);
    this.dustGeo = new THREE.BufferGeometry();
    this.dustGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    this.dustMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.22, map: this.dot, alphaTest: 0.01, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
    this.dust = new THREE.Points(this.dustGeo, this.dustMat);
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
  }
  placeDust(arr, i, anywhere) {
    const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * (A - 0.6);
    arr[i * 3] = Math.cos(a) * r; arr[i * 3 + 1] = Math.sin(a) * r;
    arr[i * 3 + 2] = anywhere ? -rand(0, 280) : -280;
  }

  buildPlayer() {
    this.player = new THREE.Group();
    this.orbMat = new THREE.MeshBasicMaterial({ color: 0x19e6ff, transparent: true });
    this.orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), this.orbMat);
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0x19e6ff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false });
    this.glow = new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 12), this.glowMat);
    this.player.add(this.orb, this.glow);
    this.scene.add(this.player);
    // Trail
    this.trailN = 16;
    this.trail = [];
    const tp = new Float32Array(this.trailN * 3), tc = new Float32Array(this.trailN * 3);
    this.trailGeo = new THREE.BufferGeometry();
    this.trailGeo.setAttribute('position', new THREE.BufferAttribute(tp, 3));
    this.trailGeo.setAttribute('color', new THREE.BufferAttribute(tc, 3));
    this.trailPts = new THREE.Points(this.trailGeo, new THREE.PointsMaterial({
      size: 0.7, map: this.dot, alphaTest: 0.01, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9,
    }));
    this.trailPts.frustumCulled = false;
    this.scene.add(this.trailPts);
  }

  buildPools() {
    // Obstacles
    this.blockGeo = new THREE.BoxGeometry(A * 2 * Math.tan(Math.PI / L) * 0.92, CFG.blockThick, 1.4);
    this.edgeGeo = new THREE.EdgesGeometry(this.blockGeo);
    this.blockMat = new THREE.MeshBasicMaterial({ color: 0x220044, transparent: true, opacity: 0.92 });
    this.gateMat = new THREE.MeshBasicMaterial({ color: 0x330033, transparent: true, opacity: 0.8 });
    this.edgeMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true });
    this.gateEdgeMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true });
    this.blockPool = []; this.rows = [];
    // Shards
    this.shardGeo = new THREE.OctahedronGeometry(0.42, 0);
    this.shardMat = new THREE.MeshBasicMaterial({ color: 0xffe066 });
    this.shardPool = []; this.shards = [];
    // Particles
    this.pMax = 360;
    this.pPos = new Float32Array(this.pMax * 3); this.pCol = new Float32Array(this.pMax * 3);
    this.pVel = new Float32Array(this.pMax * 3); this.pLife = new Float32Array(this.pMax);
    this.pGeo = new THREE.BufferGeometry();
    this.pGeo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    this.pGeo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    this.pPts = new THREE.Points(this.pGeo, new THREE.PointsMaterial({
      size: 0.5, map: this.dot, alphaTest: 0.01, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.pPts.frustumCulled = false;
    this.scene.add(this.pPts);
    this.pHead = 0;
    for (let i = 0; i < this.pMax; i++) this.pPos[i * 3 + 2] = 9999;
  }

  getBlock() {
    let b = this.blockPool.pop();
    if (!b) {
      b = new THREE.Group();
      b.mesh = new THREE.Mesh(this.blockGeo, this.blockMat);
      b.edge = new THREE.LineSegments(this.edgeGeo, this.edgeMat);
      b.add(b.mesh, b.edge);
    }
    this.scene.add(b); return b;
  }
  freeBlock(b) { this.scene.remove(b); this.blockPool.push(b); }
  getShard() {
    let s = this.shardPool.pop();
    if (!s) s = new THREE.Mesh(this.shardGeo, this.shardMat);
    this.scene.add(s); return s;
  }
  freeShard(s) { this.scene.remove(s); this.shardPool.push(s); }

  // ---------------------------------------------------------------- public api
  setSkin(id) {
    const s = SKINS.find((k) => k.id === id) || SKINS[0];
    this.skin = s;
    if (!s.rainbow) { this.orbMat.color.setHex(s.color); this.glowMat.color.setHex(s.color); }
  }
  setQuality(q) {
    this.qualityMode = q;
    const cap = q === 'low' ? 1 : q === 'high' ? Math.min(window.devicePixelRatio || 1, 2.5) : Math.min(window.devicePixelRatio || 1, 2);
    this.pixelCap = cap; this.renderer.setPixelRatio(cap); this.resize();
  }
  resize() {
    const w = this.container.clientWidth || window.innerWidth, h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // Portrait phones need a wider vertical FOV to see the lanes either side.
    this.baseFov = w / h < 0.8 ? 84 : 72;
    this.camera.updateProjectionMatrix();
  }

  reset() {
    for (const r of this.rows) r.blocks.forEach((b) => this.freeBlock(b));
    for (const s of this.shards) this.freeShard(s.mesh);
    this.rows = []; this.shards = [];
    this.lastD = 40; this.rowIndex = 0; this.stage = 0; this.lastGap = 0; this.lastFree = 5; this.lastKind = 'gap';
    this.dist = 0;
    this.speed = CFG.baseSpeed;
    this.run = { score: 0, combo: 0, mult: 1, maxMult: 1, shards: 0, grazes: 0, gates: 0, rows: 0, revived: false };
    this.energy = 100; this.phasing = false; this.holdPhase = false; this.invuln = 0;
    this.laneIdx = Math.round(this.va / STEP);
    this.scoreF = 0;
    this.hue = STAGE_HUES[0]; this.targetHue = this.hue;
    this.trail.length = 0;
    this.audio.setBpm(CFG.baseBpm);
  }

  startRun() {
    this.reset();
    this.laneIdx = 0; this.va = 0; this.ca = 0;
    this.state = 'play';
    this.audio.intensity = 0;
    this.hooks.onEvent && this.hooks.onEvent('start');
  }
  toMenu() {
    for (const r of this.rows) r.blocks.forEach((b) => this.freeBlock(b));
    for (const s of this.shards) this.freeShard(s.mesh);
    this.rows = []; this.shards = [];
    this.state = 'idle'; this.audio.intensity = -1; this.audio.setBpm(CFG.baseBpm);
    this.targetHue = STAGE_HUES[0];
  }
  pause() { if (this.state === 'play') { this.state = 'paused'; this.audio.suspend(); } }
  resume() { if (this.state === 'paused') { this.state = 'play'; this.audio.resume(); this.last = performance.now(); } }

  revive() {
    // clear the next stretch so the player gets a fair restart
    const keep = [];
    for (const r of this.rows) {
      if (r.d - this.dist < 70 && r.d - this.dist > -20) r.blocks.forEach((b) => this.freeBlock(b));
      else keep.push(r);
    }
    this.rows = keep;
    this.lastD = Math.max(this.lastD, this.dist + 70);
    this.invuln = CFG.reviveInvuln; this.energy = 100; this.run.revived = true;
    this.state = 'play'; this.timeScale = 1; this.player.visible = true;
    this.audio.intensity = Math.min(3, this.stage);
  }

  // ---------------------------------------------------------------- input
  move(dir) {
    if (this.state !== 'play') return;
    this.laneIdx += dir; this.audio.swish(); this.buzz(6);
  }
  flip() {
    if (this.state !== 'play') return;
    this.laneIdx += L / 2 * (Math.random() < 0.5 ? 1 : -1); this.audio.swish(); this.buzz(10);
  }
  setHold(on) {
    if (on === this.holdPhase) return;
    this.holdPhase = on;
  }
  buzz(ms) { this.hooks.onEvent && this.hooks.onEvent('buzz', ms); }

  // ---------------------------------------------------------------- spawning
  stageSpeed() { return CFG.baseSpeed + this.stage * CFG.speedPerStage; }
  stageBpm() { return CFG.baseBpm + this.stage * CFG.bpmPerStage; }

  spawnRow() {
    const idx = this.rowIndex++;
    const stage = Math.min(CFG.maxStage, Math.floor(idx / CFG.rowsPerStage));
    const speed = CFG.baseSpeed + stage * CFG.speedPerStage;
    const bpm = CFG.baseBpm + stage * CFG.bpmPerStage;
    const bpr = stage < 4 ? 2 : (Math.random() < 0.5 ? 2 : 1.5);
    const gapSec = 60 / bpm * bpr;
    const d = this.lastD + speed * gapSec;
    const maxShift = clamp(Math.floor(gapSec / 0.42), 1, 3);
    let kind = 'gap', mask = 0, free = 0, center = this.lastGap, depth = 1.4;

    const tutorial = idx < 3 && !this.tutorialDone;
    if (!tutorial && idx > 6 && idx % CFG.gateEvery === CFG.gateEvery - 1) {
      kind = 'gate'; mask = (1 << L) - 1; depth = CFG.gateDepth; free = L;
      center = this.lastGap;
    } else {
      const roll = Math.random();
      if (!tutorial && stage >= 1 && roll < 0.22 && this.lastFree >= 2) kind = 'checker';
      else if (!tutorial && stage >= 2 && roll < 0.34) kind = 'wedge';
      if (kind === 'checker') {
        const par = mod(this.lastGap + ri(0, 1), 2);
        for (let k = 0; k < L; k++) if (k % 2 !== par) mask |= 1 << k;
        free = 4; center = this.lastGap;
      } else {
        free = tutorial ? 5 : clamp(4 - Math.floor(stage * 0.6) + ri(-1, 1), 1, 5);
        if (kind === 'wedge') free = clamp(free, 2, 3);
        const shift = tutorial ? (idx === 0 ? 0 : (Math.random() < 0.5 ? -1 : 1)) : ri(-maxShift, maxShift);
        center = this.lastGap + shift;
        const first = center - Math.floor((free - 1) / 2);
        mask = (1 << L) - 1;
        for (let i = 0; i < free; i++) mask &= ~(1 << mod(first + i, L));
      }
    }
    const row = { d, mask, kind, depth, blocks: [], scored: false, free, center, hueOff: kind === 'checker' ? 60 : 0 };
    for (let k = 0; k < L; k++) {
      if (!(mask & (1 << k))) continue;
      const b = this.getBlock();
      const isGate = kind === 'gate';
      b.mesh.material = isGate ? this.gateMat : this.blockMat;
      b.edge.material = isGate ? this.gateEdgeMat : this.edgeMat;
      b.mesh.scale.z = isGate ? depth / 1.4 : 1; b.edge.scale.z = b.mesh.scale.z;
      const [x, y] = polar(k * STEP, A - CFG.blockThick / 2);
      b.position.set(x, y, 0); b.rotation.z = k * STEP;
      row.blocks.push(b);
    }
    this.rows.push(row);

    // Shards drawn along the safe path from the previous gap to this one.
    const from = this.lastGap, to = center;
    if (kind !== 'gate') {
      for (let i = 1; i <= 3; i++) {
        const f = i / 4;
        const lane = Math.round(from + (to - from) * f);
        const s = { d: this.lastD + (d - this.lastD) * f, lane, mesh: this.getShard(), taken: false };
        const [x, y] = polar(lane * STEP, CFG.playerR);
        s.mesh.position.set(x, y, 0); s.mesh.rotation.z = lane * STEP;
        this.shards.push(s);
      }
    }
    this.lastD = d; this.lastGap = center; this.lastFree = free; this.lastKind = kind;
  }

  // ---------------------------------------------------------------- particles
  burst(x, y, z, color, n, spd, spread = 1) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      const j = this.pHead; this.pHead = (this.pHead + 1) % this.pMax;
      this.pPos[j * 3] = x; this.pPos[j * 3 + 1] = y; this.pPos[j * 3 + 2] = z;
      const a = Math.random() * TAU, e = (Math.random() - 0.5) * Math.PI;
      const s = rand(0.3, 1) * spd;
      this.pVel[j * 3] = Math.cos(a) * Math.cos(e) * s * spread;
      this.pVel[j * 3 + 1] = Math.sin(e) * s * spread;
      this.pVel[j * 3 + 2] = Math.sin(a) * Math.cos(e) * s * 0.6;
      this.pCol[j * 3] = c.r; this.pCol[j * 3 + 1] = c.g; this.pCol[j * 3 + 2] = c.b;
      this.pLife[j] = rand(0.5, 1.1);
    }
  }
  updateParticles(dt, scroll) {
    for (let i = 0; i < this.pMax; i++) {
      if (this.pLife[i] <= 0) { this.pPos[i * 3 + 2] = 9999; continue; }
      this.pLife[i] -= dt;
      this.pPos[i * 3] += this.pVel[i * 3] * dt;
      this.pPos[i * 3 + 1] += this.pVel[i * 3 + 1] * dt;
      this.pPos[i * 3 + 2] += this.pVel[i * 3 + 2] * dt + scroll;
      const f = clamp(this.pLife[i], 0, 1);
      this.pCol[i * 3] *= 0.985; this.pCol[i * 3 + 1] *= 0.985; this.pCol[i * 3 + 2] *= 0.985;
      if (f <= 0) this.pPos[i * 3 + 2] = 9999;
    }
    this.pGeo.attributes.position.needsUpdate = true;
    this.pGeo.attributes.color.needsUpdate = true;
  }

  // ---------------------------------------------------------------- main loop
  loop(now) {
    requestAnimationFrame(this.loop);
    let dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.adaptQuality(dt);
    if (this.state === 'paused') { this.render(); return; }
    this.update(dt);
    this.render();
    this.hooks.onFrame && this.hooks.onFrame(this);
  }

  adaptQuality(dt) {
    if (this.qualityMode && this.qualityMode !== 'auto') return;
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 2) {
      const fps = this.fpsN / this.fpsAcc;
      this.fpsAcc = 0; this.fpsN = 0;
      if (fps < 40 && this.pixelCap > 1) {
        this.pixelCap = Math.max(1, this.pixelCap - 0.25);
        this.renderer.setPixelRatio(this.pixelCap); this.resize();
      }
    }
  }

  update(dt) {
    const real = dt;
    // slow-mo while dying
    if (this.state === 'dying') {
      this.deadT += real;
      this.timeScale = clamp(0.25 + this.deadT * 0.2, 0.25, 0.5);
      if (this.deadT > 1.0) { this.state = 'dead'; this.hooks.onDead && this.hooks.onDead(this.run); }
    }
    dt *= this.timeScale;

    const playing = this.state === 'play';
    const idle = this.state === 'idle';
    const target = playing ? this.stageSpeed() : idle ? 16 : this.state === 'dying' ? 8 : 6;
    this.speed += (target - this.speed) * Math.min(1, dt * 2);
    const scroll = this.speed * dt;
    this.dist += scroll;

    // hue blend
    let dh = this.targetHue - this.hue; if (dh > 180) dh -= 360; if (dh < -180) dh += 360;
    this.hue = mod(this.hue + dh * Math.min(1, real * 1.5), 360);
    const col = new THREE.Color().setHSL(this.hue / 360, 1, 0.55);
    const colDim = new THREE.Color().setHSL(this.hue / 360, 0.9, 0.22);
    const bg = new THREE.Color().setHSL(this.hue / 360, 0.8, 0.035);
    this.scene.background = bg; this.scene.fog.color.copy(bg);
    this.ringMatA.color.copy(col); this.ringMatB.color.copy(colDim); this.cornerMat.color.copy(colDim);
    this.edgeMat.color.copy(col);
    this.blockMat.color.setHSL(((this.hue + 30) % 360) / 360, 0.8, 0.10);
    this.gateEdgeMat.color.setHSL(((this.hue + 160) % 360) / 360, 1, 0.65);
    this.gateMat.color.setHSL(((this.hue + 160) % 360) / 360, 0.9, 0.12);
    this.dustMat.color.copy(col);
    this.pulse = Math.max(0, this.pulse - real * 3.2);

    if (idle) {
      this.va += real * 0.35; this.laneIdx = this.va / STEP;
    } else {
      this.va += (this.laneIdx * STEP - this.va) * Math.min(1, real * 20);
    }

    // ---- gameplay
    if (playing) this.updatePlay(dt, real, scroll);
    else if (this.state === 'dying') this.updateRowsOnly(scroll);

    // ---- visuals
    this.ca += (this.va - this.ca) * Math.min(1, real * 7);
    const [px, py] = polar(this.va, CFG.playerR);
    this.player.position.set(px, py, 0);
    this.player.rotation.z = this.va;
    this.orb.rotation.x += real * 4; this.orb.rotation.y += real * 3;
    const ph = this.phasing;
    this.orbMat.opacity = ph ? 0.4 : 1;
    this.glowMat.opacity = (ph ? 0.35 : 0.14) + this.pulse * 0.18;
    const sc = 1 + this.pulse * 0.22 + (ph ? 0.2 : 0);
    this.glow.scale.setScalar(sc * (ph ? 1.4 : 1));
    if (this.skin.rainbow) {
      const rc = new THREE.Color().setHSL((performance.now() / 1800) % 1, 1, 0.6);
      this.orbMat.color.copy(rc); this.glowMat.color.copy(rc);
    }
    this.trailPts.visible = !idle;
    if (idle) this.player.visible = false;
    else if (this.invuln > 0) this.player.visible = Math.floor(performance.now() / 90) % 2 === 0 || this.state !== 'play';
    else if (this.state !== 'dying' && this.state !== 'dead') this.player.visible = true;

    this.updateTrail(scroll, px, py);
    this.updateTunnel(scroll);
    this.updateParticles(dt, scroll);
    this.updateCamera(real, px, py);
  }

  updateTrail(scroll, px, py) {
    if (this.state === 'dying' || this.state === 'dead') return;
    this.trail.unshift({ x: px, y: py, z: 0 });
    if (this.trail.length > this.trailN) this.trail.pop();
    const p = this.trailGeo.attributes.position.array, c = this.trailGeo.attributes.color.array;
    const base = this.skin.rainbow ? new THREE.Color().setHSL((performance.now() / 1800) % 1, 1, 0.6) : new THREE.Color(this.skin.color);
    for (let i = 0; i < this.trailN; i++) {
      const t = this.trail[i];
      if (t) { t.z += i === 0 ? 0 : scroll; p[i * 3] = t.x; p[i * 3 + 1] = t.y; p[i * 3 + 2] = t.z; }
      else p[i * 3 + 2] = 9999;
      const f = (1 - i / this.trailN) * (this.phasing ? 0.5 : 1);
      c[i * 3] = base.r * f; c[i * 3 + 1] = base.g * f; c[i * 3 + 2] = base.b * f;
    }
    this.trailGeo.attributes.position.needsUpdate = true;
    this.trailGeo.attributes.color.needsUpdate = true;
  }

  updateTunnel(scroll) {
    const total = this.ringCount * this.ringGap;
    for (let i = 0; i < this.ringCount; i++) {
      const z = -mod(i * this.ringGap - this.dist, total) + 8;
      this.rings[i].position.z = z;
      const s = 1 + this.pulse * 0.04 * (i % 4 === 0 ? 1 : 0);
      this.rings[i].scale.set(s, s, 1);
    }
    const arr = this.dustGeo.attributes.position.array;
    for (let i = 0; i < arr.length / 3; i++) {
      arr[i * 3 + 2] += scroll * 1.0 + 0.02;
      if (arr[i * 3 + 2] > 8) this.placeDust(arr, i, false);
    }
    this.dustGeo.attributes.position.needsUpdate = true;
    const cur = mod(Math.round(this.va / STEP), L);
    for (let k = 0; k < L; k++) {
      const m = this.panels[k].material;
      m.color.setHSL(this.hue / 360, 1, 0.5);
      const near = Math.abs(circ(k, this.va / STEP));
      m.opacity = 0.035 + (near < 0.5 ? 0.09 : near < 1.5 ? 0.04 : 0) + this.pulse * 0.03;
    }
    // phase makes walls ghostly
    const wo = this.phasing ? 0.18 : 0.92;
    this.blockMat.opacity += (wo - this.blockMat.opacity) * 0.35;
    this.gateMat.opacity += ((this.phasing ? 0.1 : 0.8) - this.gateMat.opacity) * 0.35;
    this.edgeMat.opacity += ((this.phasing ? 0.4 : 1) - this.edgeMat.opacity) * 0.35;
  }

  updateCamera(real, px, py) {
    const cam = this.camera;
    const [cx, cy] = polar(this.ca, 1.9);
    const shk = this.shake;
    cam.position.set(cx + (Math.random() - 0.5) * shk, cy + (Math.random() - 0.5) * shk, 8.5);
    cam.rotation.z = this.ca + (Math.random() - 0.5) * shk * 0.03;
    cam.rotation.x = -0.1;
    this.shake = Math.max(0, this.shake - real * 2.2);
    const tf = this.baseFov + (this.phasing ? 10 : 0) + (this.speed - CFG.baseSpeed) * 0.25 + this.pulse * 1.5;
    this.fov += (tf - this.fov) * Math.min(1, real * 6);
    if (Math.abs(cam.fov - this.fov) > 0.02) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
  }

  render() { this.renderer.render(this.scene, this.camera); }

  // ---------------------------------------------------------------- gameplay update
  updateRowsOnly(scroll) {
    for (const r of this.rows) for (const b of r.blocks) b.position.z = this.dist - r.d;
    for (const s of this.shards) { s.mesh.position.z = this.dist - s.d; }
  }

  updatePlay(dt, real, scroll) {
    const run = this.run;
    // phase
    const wantPhase = this.holdPhase && this.energy > 0;
    if (wantPhase !== this.phasing) { this.phasing = wantPhase; this.audio.phase(wantPhase); if (wantPhase) this.buzz(15); }
    if (this.phasing) {
      this.energy = Math.max(0, this.energy - CFG.phaseDrain * dt);
      if (this.energy <= 0) { this.phasing = false; this.audio.phase(false); }
    } else this.energy = Math.min(100, this.energy + CFG.phaseRegen * dt);
    if (this.invuln > 0) this.invuln -= dt;

    // spawn
    while (this.lastD < this.dist + CFG.spawnAhead) this.spawnRow();

    const laneF = this.va / STEP;
    const hue = this.hue;
    for (let i = this.rows.length - 1; i >= 0; i--) {
      const r = this.rows[i];
      const z = this.dist - r.d;                     // row centre in world z (player at 0)
      for (const b of r.blocks) b.position.z = z;
      const half = r.depth / 2 + 0.45;
      // collision
      if (Math.abs(z) < half && !r.scored) {
        r.inside = true;
        if (!this.phasing && this.invuln <= 0) {
          for (let k = 0; k < L; k++) {
            if ((r.mask & (1 << k)) && Math.abs(circ(k, laneF)) < 0.56) { this.die(r); return; }
          }
        }
      }
      // passed
      if (z > half && !r.scored) {
        r.scored = true;
        this.onRowPassed(r, laneF);
      }
      if (z > 14) { r.blocks.forEach((b) => this.freeBlock(b)); this.rows.splice(i, 1); }
    }

    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i];
      const z = this.dist - s.d;
      s.mesh.position.z = z; s.mesh.rotation.y += real * 4;
      if (!s.taken && Math.abs(z) < 1.1 && Math.abs(circ(s.lane, laneF)) < 0.7) {
        s.taken = true; this.collectShard(s);
      }
      if (s.taken || z > 12) { this.freeShard(s.mesh); this.shards.splice(i, 1); }
    }

    // score from distance
    this.scoreF += scroll * 0.35;
    run.score = Math.floor(this.scoreF);
  }

  onRowPassed(r, laneF) {
    const run = this.run;
    run.rows++; run.combo++;
    const mult = Math.min(8, 1 + Math.floor(run.combo / 6));
    if (mult > run.mult) { this.hooks.onEvent && this.hooks.onEvent('mult', mult); this.audio.stageUp(); }
    run.mult = mult; run.maxMult = Math.max(run.maxMult, mult);
    let pts = 10 * mult, bright = false;
    const [px, py] = polar(this.va, CFG.playerR);

    if (r.kind === 'gate') {
      if (this.phasing) {
        run.gates++; pts += 60 * mult; bright = true;
        this.burst(px, py, 0, 0xffffff, 40, 9);
        this.hooks.onEvent && this.hooks.onEvent('popup', { text: 'PHASE +' + 60 * mult, kind: 'gate' });
        this.energy = Math.min(100, this.energy + 10);
      }
    } else {
      // graze: passed within one lane of a wall without touching
      let near = false;
      for (let k = 0; k < L; k++) if ((r.mask & (1 << k)) && Math.abs(circ(k, laneF)) < 1.15 && Math.abs(circ(k, laneF)) >= 0.56) near = true;
      if (this.phasing) {
        // phasing through a real wall counts as a (weaker) graze
        for (let k = 0; k < L; k++) if ((r.mask & (1 << k)) && Math.abs(circ(k, laneF)) < 0.56) near = true;
      }
      if (near) {
        run.grazes++; pts += 25 * mult; bright = true;
        this.energy = Math.min(100, this.energy + CFG.grazeEnergy);
        this.audio.graze(); this.buzz(12);
        this.burst(px, py, 0, 0xffffff, 18, 6);
        this.hooks.onEvent && this.hooks.onEvent('popup', { text: 'GRAZE +' + 25 * mult, kind: 'graze' });
      }
    }
    this.scoreF += pts;
    this.pulse = 1;
    this.audio.note(Math.round(r.center) + 5, bright);

    // stage progression
    const st = Math.min(CFG.maxStage, Math.floor(run.rows / CFG.rowsPerStage));
    if (st > this.stage) {
      this.stage = st;
      this.targetHue = STAGE_HUES[st % STAGE_HUES.length];
      this.audio.setBpm(this.stageBpm());
      this.audio.intensity = Math.min(3, st);
      this.audio.stageUp();
      this.hooks.onStage && this.hooks.onStage(st);
    }
  }

  collectShard(s) {
    const run = this.run;
    run.shards++; this.scoreF += 5 * run.mult;
    this.audio.collect(run.shards % 5);
    const [x, y] = polar(s.lane * STEP, CFG.playerR);
    this.burst(x, y, 0, 0xffe066, 8, 4);
    this.buzz(4);
  }

  die(row) {
    if (this.state !== 'play') return;
    this.state = 'dying'; this.deadT = 0; this.shake = 1.6;
    this.run.score = Math.floor(this.scoreF);
    const [px, py] = polar(this.va, CFG.playerR);
    const c = this.skin.rainbow ? 0xffffff : this.skin.color;
    this.burst(px, py, 0, c, 110, 16);
    this.burst(px, py, 0, 0xffffff, 40, 10);
    this.player.visible = false;
    this.audio.crash(); this.audio.intensity = -1;
    this.buzz(160);
    this.phasing = false; this.holdPhase = false;
    this.hooks.onEvent && this.hooks.onEvent('crash');
  }
}
