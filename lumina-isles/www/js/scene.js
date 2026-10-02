// Three.js presentation for Lumina Isles: floating island, glass mirrors, crystal prisms, glowing beams.
// All game rules live in puzzle.js; this file only draws state and reports taps.
import * as THREE from '../vendor/three.module.min.js';
import { DIRS, COLORS } from './puzzle.js';

const S = 1.2;                   // tile pitch (world units)
const BEAM_Y = 0.42;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function makeDot() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class IsleScene {
  constructor(container, hooks = {}) {
    this.container = container; this.hooks = hooks;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' }));
    this.pixelCap = Math.min(window.devicePixelRatio || 1, 2);
    r.setPixelRatio(this.pixelCap); r.setClearColor(0x000000, 0);
    container.appendChild(r.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
    this.dot = makeDot();

    this.scene.add(new THREE.HemisphereLight(0xb8c8ff, 0x201038, 1.05));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1); sun.position.set(5, 11, 7); this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x8866ff, 0.5); rim.position.set(-6, 4, -8); this.scene.add(rim);

    // stars
    const n = 420, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.acos(2 * Math.random() - 1), d = 45 + Math.random() * 40;
      arr[i * 3] = Math.sin(e) * Math.cos(a) * d; arr[i * 3 + 1] = Math.cos(e) * d * 0.7 + 4; arr[i * 3 + 2] = Math.sin(e) * Math.sin(a) * d;
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.7, map: this.dot, transparent: true, opacity: 0.8, depthWrite: false, alphaTest: 0.01 }));
    this.scene.add(this.stars);

    this.island = new THREE.Group(); this.scene.add(this.island);
    this.beamGroup = new THREE.Group(); this.island.add(this.beamGroup);
    this.beamMats = {}; this.beamPool = []; this.beams = [];
    this.boxGeo = new THREE.BoxGeometry(1, 1, 1);
    this.dev = {}; this.targets = {}; this.hintMesh = null; this.sig = '';
    this.t = 0; this.viewY = 0; this.viewTarget = 0; this.az = 0; this.azTarget = 0; this.dist = 10; this.distTarget = 10; this.celebrating = 0; this.shake = 0;

    // sparks
    this.pMax = 260; this.pPos = new Float32Array(this.pMax * 3); this.pCol = new Float32Array(this.pMax * 3);
    this.pVel = new Float32Array(this.pMax * 3); this.pLife = new Float32Array(this.pMax); this.pHead = 0;
    for (let i = 0; i < this.pMax; i++) this.pPos[i * 3 + 1] = -999;
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3)); pg.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    this.pGeo = pg;
    this.pPts = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.32, map: this.dot, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, alphaTest: 0.01 }));
    this.pPts.frustumCulled = false; this.island.add(this.pPts);

    this.bindInput();
    this.resize(); addEventListener('resize', () => this.resize());
    this.last = performance.now(); this.loop = this.loop.bind(this); requestAnimationFrame(this.loop);
  }

  // ------------------------------------------------------------ layout / theme
  resize() {
    const w = this.container.clientWidth || innerWidth, h = this.container.clientHeight || innerHeight;
    this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.fit();
  }
  fit() {
    const N = this.N || 5, w = N * S * 1.35;
    const vf = THREE.MathUtils.degToRad(this.camera.fov), hf = 2 * Math.atan(Math.tan(vf / 2) * this.camera.aspect);
    const needW = (w / 2) / Math.tan(hf / 2), needH = (N * S * 1.25 / 2) / Math.tan(vf / 2);
    this.baseDist = Math.max(needW, needH * 0.9) + 2;
    this.distTarget = this.baseDist * (this.celebrating > 0 ? 0.82 : 1) * (this.zoom || 1);
  }
  applyTheme(th) {
    this.theme = th;
    const hex = (n) => '#' + n.toString(16).padStart(6, '0');
    this.container.style.background = `radial-gradient(120% 90% at 50% 20%, ${hex(th.bgBot)} 0%, ${hex(th.bgTop)} 75%)`;
    if (this.tileA) {
      this.tileA.color.setHex(th.tileA); this.tileB.color.setHex(th.tileB); this.rockMat.color.setHex(th.rock);
      this.rimMat.color.setHex(th.rock).multiplyScalar(1.4); this.edgeMat && this.edgeMat.color.setHex(th.accent);
    }
  }

  // ------------------------------------------------------------ build puzzle
  clearIsland() {
    for (const c of [...this.island.children]) {
      if (c === this.beamGroup || c === this.pPts) continue;
      this.island.remove(c);
      c.traverse((o) => { if (o.geometry && !o.userData.shared) o.geometry.dispose(); });
    }
    this.releaseBeams(); this.dev = {}; this.targets = {}; this.hintMesh = null; this.sig = '';
  }
  load(puzzle, theme) {
    this.clearIsland();
    const { N, cells } = puzzle; this.N = N; this.cells = cells;
    this.celebrating = 0; this.az = 0; this.azTarget = 0;
    this.tileA = new THREE.MeshStandardMaterial({ color: theme.tileA, roughness: 0.7, metalness: 0.1 });
    this.tileB = new THREE.MeshStandardMaterial({ color: theme.tileB, roughness: 0.7, metalness: 0.1 });
    this.rockMat = new THREE.MeshStandardMaterial({ color: theme.rock, roughness: 0.95, flatShading: true });
    this.rimMat = new THREE.MeshStandardMaterial({ color: theme.rock, roughness: 0.6, metalness: 0.2 });
    this.rimMat.color.multiplyScalar(1.4);
    this.edgeMat = new THREE.LineBasicMaterial({ color: theme.accent, transparent: true, opacity: 0.55 });
    this.applyTheme(theme);

    const tileGeo = new THREE.BoxGeometry(S * 0.95, 0.3, S * 0.95);
    const pos = (x, y) => [(x - (N - 1) / 2) * S, (y - (N - 1) / 2) * S];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const m = new THREE.Mesh(tileGeo, (x + y) % 2 ? this.tileA : this.tileB);
      const [px, pz] = pos(x, y); m.position.set(px, -0.15, pz); m.userData.shared = true; this.island.add(m);
    }
    const W = N * S + 0.3;
    const rimM = new THREE.Mesh(new THREE.BoxGeometry(W, 0.22, W), this.rimMat); rimM.position.y = -0.41; this.island.add(rimM);
    const h = N * S * 0.75;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(W * 0.62, h, 7, 1), this.rockMat);
    cone.rotation.x = Math.PI; cone.rotation.y = 0.3; cone.position.y = -0.52 - h / 2; this.island.add(cone);
    const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(W, 0.22, W)), this.edgeMat); frame.position.y = -0.41; this.island.add(frame);

    cells.forEach((c, i) => {
      const x = i % N, y = Math.floor(i / N), [px, pz] = pos(x, y);
      if (c.t === 'empty') return;
      const g = new THREE.Group(); g.position.set(px, 0, pz); this.island.add(g);
      if (c.t === 'wall') this.buildWall(g);
      else if (c.t === 'emit') this.buildEmitter(g, c);
      else if (c.t === 'target') this.buildTarget(g, c, i);
      else if (c.t === 'mirror') this.buildMirror(g, c, i);
      else if (c.t === 'split') this.buildSplit(g, c, i);
    });
    this.fit(); this.dist = this.distTarget * 1.25;
  }

  buildWall(g) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.8, 0.85), new THREE.MeshStandardMaterial({ color: 0x14102a, roughness: 0.5, metalness: 0.4 }));
    m.position.y = 0.4; g.add(m);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), this.edgeMat); e.position.y = 0.4; g.add(e);
  }
  buildEmitter(g, c) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.4, 0.72), new THREE.MeshStandardMaterial({ color: 0x252040, roughness: 0.4, metalness: 0.6 }));
    base.position.y = 0.2; g.add(base);
    const col = COLORS[c.color];
    const pivot = new THREE.Group(); pivot.rotation.y = -c.dir * Math.PI / 2; g.add(pivot);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.28, 16), new THREE.MeshBasicMaterial({ color: col }));
    lens.rotation.x = Math.PI / 2; lens.position.set(0, BEAM_Y - 0.0, -0.3); pivot.add(lens);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.position.copy(lens.position); pivot.add(halo); g.userData.halo = halo;
    base.position.y = 0.22; base.scale.y = 1.1;
  }
  buildTarget(g, c, i) {
    const col = COLORS[c.color];
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.22, 20), new THREE.MeshStandardMaterial({ color: 0x1a1635, roughness: 0.5, metalness: 0.5 }));
    ped.position.y = 0.11; g.add(ped);
    const ringMat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.12, roughness: 0.3 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.055, 10, 28), ringMat); ring.position.y = 0.52; g.add(ring);
    const coreMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.25 });
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 1), coreMat); core.position.y = 0.52; g.add(core);
    const glowMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), glowMat); glow.position.y = 0.52; g.add(glow);
    this.targets[i] = { g, ring, core, ringMat, coreMat, glowMat, lit: 0, goal: 0, color: col };
  }
  buildMirror(g, c, i) {
    const pivot = new THREE.Group(); g.add(pivot);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.62, 0.07), new THREE.MeshStandardMaterial({
      color: 0xcfeaff, emissive: c.decoy ? 0x5a6a9a : 0x6fb7ff, emissiveIntensity: c.decoy ? 0.15 : 0.4, roughness: 0.12, metalness: 0.3, transparent: true, opacity: 0.88 }));
    glass.position.y = BEAM_Y; pivot.add(glass);
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(glass.geometry), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: c.decoy ? 0.5 : 0.95 }));
    edge.position.y = BEAM_Y; pivot.add(edge);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, BEAM_Y - 0.1, 10), new THREE.MeshStandardMaterial({ color: 0x3b3566, metalness: 0.7, roughness: 0.3 }));
    post.position.y = (BEAM_Y - 0.1) / 2 + 0.02; g.add(post);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 28), new THREE.MeshBasicMaterial({ color: this.theme.accent, transparent: true, opacity: c.decoy ? 0.12 : 0.28, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.012; g.add(ring);
    const base = Math.PI / 4 - c.rot * Math.PI / 2;
    pivot.rotation.y = base;
    this.dev[i] = { g, pivot, kind: 'mirror', cur: base, goal: base };
  }
  buildSplit(g, c, i) {
    const pivot = new THREE.Group(); g.add(pivot);
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), new THREE.MeshStandardMaterial({
      color: 0xfff1ff, emissive: 0xc77dff, emissiveIntensity: 0.55, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.92, flatShading: true }));
    crystal.scale.y = 1.35; crystal.position.y = BEAM_Y; pivot.add(crystal);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.36, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    arrow.rotation.x = -Math.PI / 2; arrow.position.set(0, BEAM_Y, -0.46); pivot.add(arrow);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 28), new THREE.MeshBasicMaterial({ color: 0xc77dff, transparent: true, opacity: 0.4, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.012; g.add(ring);
    const base = -c.rot * Math.PI / 2; pivot.rotation.y = base;
    this.dev[i] = { g, pivot, kind: 'split', cur: base, goal: base, crystal };
  }

  // ------------------------------------------------------------ dynamic state
  rotateCell(i) {
    const d = this.dev[i]; if (!d) return;
    d.goal -= Math.PI / 2;
    this.puff(d.g.position.x, BEAM_Y, d.g.position.z, 0xffffff, 8);
  }
  setHint(i) {
    if (this.hintMesh) { this.island.remove(this.hintMesh); this.hintMesh = null; }
    if (i < 0 || !this.dev[i]) return;
    const m = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.68, 32), new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.copy(this.dev[i].g.position); m.position.y = 0.05; this.island.add(m); this.hintMesh = m;
  }
  clearHint() { this.setHint(-1); }

  matsFor(ci) {
    if (!this.beamMats[ci]) {
      const col = new THREE.Color(COLORS[ci]);
      this.beamMats[ci] = {
        core: new THREE.MeshBasicMaterial({ color: col.clone().lerp(new THREE.Color(0xffffff), 0.65) }),
        halo: new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false }),
        outer: new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false }),
      };
    }
    return this.beamMats[ci];
  }
  releaseBeams() { for (const b of this.beams) { this.beamGroup.remove(b.g); this.beamPool.push(b); } this.beams = []; }
  getBeam(ci) {
    let b = this.beamPool.pop();
    if (!b) {
      const g = new THREE.Group();
      b = { g, core: new THREE.Mesh(this.boxGeo), halo: new THREE.Mesh(this.boxGeo), outer: new THREE.Mesh(this.boxGeo) };
      g.add(b.outer, b.halo, b.core);
    }
    const m = this.matsFor(ci);
    b.core.material = m.core; b.halo.material = m.halo; b.outer.material = m.outer;
    this.beamGroup.add(b.g); return b;
  }

  /** Redraw beams from a puzzle.simulate() result. Returns indices of targets that just lit. */
  showBeams(sim, quick = false) {
    const N = this.N, sig = sim.segs.map((s) => [s.x1, s.y1, s.x2, s.y2, s.color].join()).join('|');
    const newly = [];
    for (const i of sim.targets) {
      const t = this.targets[i], on = sim.lit.has(i);
      if (on && t.goal === 0) newly.push(i);
      t.goal = on ? 1 : 0;
    }
    if (sig === this.sig) return newly;
    this.sig = sig; this.releaseBeams();
    const w = (cx, cy) => [(cx - (N - 1) / 2) * S, (cy - (N - 1) / 2) * S];
    const now = performance.now() / 1000;
    for (const s of sim.segs) {
      const b = this.getBeam(s.color), [ax, az] = w(s.x1, s.y1), [bx, bz] = w(s.x2, s.y2);
      const len = Math.hypot(bx - ax, bz - az);
      b.ax = ax; b.az = az; b.dx = (bx - ax) / (len || 1); b.dz = (bz - az) / (len || 1); b.len = len;
      b.t0 = quick ? 0 : now + (s.order % 1000) * 0.045; b.horiz = Math.abs(bz - az) < 1e-6;
      b.g.rotation.y = b.horiz ? 0 : Math.PI / 2;
      b.g.position.y = BEAM_Y; b.core.scale.set(1, 0.07, 0.07); b.halo.scale.set(1, 0.2, 0.2); b.outer.scale.set(1, 0.42, 0.42);
      b.g.scale.set(0.001, 1, 1);
      this.beams.push(b);
    }
    return newly;
  }

  // ------------------------------------------------------------ fx
  puff(x, y, z, color, n, speed = 1.6) {
    const c = new THREE.Color(color);
    for (let k = 0; k < n; k++) {
      const j = this.pHead; this.pHead = (this.pHead + 1) % this.pMax;
      this.pPos[j * 3] = x; this.pPos[j * 3 + 1] = y; this.pPos[j * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2, s = (0.4 + Math.random()) * speed;
      this.pVel[j * 3] = Math.cos(a) * Math.cos(e) * s; this.pVel[j * 3 + 1] = Math.sin(e) * s + 0.6; this.pVel[j * 3 + 2] = Math.sin(a) * Math.cos(e) * s;
      this.pCol[j * 3] = c.r; this.pCol[j * 3 + 1] = c.g; this.pCol[j * 3 + 2] = c.b; this.pLife[j] = 0.5 + Math.random() * 0.7;
    }
  }
  burstTarget(i) {
    const t = this.targets[i]; if (!t) return;
    this.puff(t.g.position.x, 0.55, t.g.position.z, t.color, 26, 2.8);
  }
  celebrate() {
    this.celebrating = 3.2; this.distTarget = this.baseDist * 0.82; this.shake = 0.0;
    for (const i in this.targets) this.puff(this.targets[i].g.position.x, 0.6, this.targets[i].g.position.z, this.targets[i].color, 40, 4);
    for (let k = 0; k < 6; k++) this.puff((Math.random() - 0.5) * this.N * S, 1 + Math.random() * 2, (Math.random() - 0.5) * this.N * S, [0xffd36a, 0xff5d8f, 0x4dd8ff, 0x7dff7a][k % 4], 20, 3);
  }
  stopCelebrate() { this.celebrating = 0; this.distTarget = this.baseDist * (this.zoom || 1); }
  setHome(on) { this.zoom = on ? 1.55 : 1; this.viewTarget = on ? 3.3 : 0; this.fit(); }

  // ------------------------------------------------------------ input (tap = rotate, drag = orbit)
  bindInput() {
    const el = this.renderer.domElement; let p = null;
    el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); p = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0, az: this.azTarget }; });
    el.addEventListener('pointermove', (e) => {
      if (!p) return; const dx = e.clientX - p.x; p.moved = Math.max(p.moved, Math.abs(dx), Math.abs(e.clientY - p.y));
      if (p.moved > 12) this.azTarget = clamp(p.az - dx * 0.006, -0.9, 0.9);
    });
    const up = (e) => {
      if (!p) return; const q = p; p = null;
      if (q.moved < 12 && performance.now() - q.t < 450) this.pick(e.clientX, e.clientY);
      this.holdOrbit = performance.now();
    };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', () => { p = null; });
  }
  pick(cx, cy) {
    if (!this.cells) return;
    const r = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector3(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1, 0.5).unproject(this.camera);
    const o = this.camera.position, d = v.sub(o).normalize();
    // intersect with plane at mirror height in island-local space
    this.island.updateMatrixWorld(true);
    const inv = this.island.matrixWorld.clone().invert();
    const lo = o.clone().applyMatrix4(inv), ld = d.clone().transformDirection(inv);
    const t = (BEAM_Y - lo.y) / ld.y; if (!(t > 0)) return;
    const px = lo.x + ld.x * t, pz = lo.z + ld.z * t;
    let best = -1, bd = (S * 0.72) ** 2;
    for (const i in this.dev) { const g = this.dev[i].g, dd = (g.position.x - px) ** 2 + (g.position.z - pz) ** 2; if (dd < bd) { bd = dd; best = +i; } }
    if (best >= 0) this.hooks.onTap && this.hooks.onTap(best);
  }

  // ------------------------------------------------------------ frame
  loop(now) {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now; this.t += dt;
    this.update(dt, now / 1000); this.renderer.render(this.scene, this.camera);
  }
  update(dt, nowS) {
    // island float
    this.island.position.y = Math.sin(this.t * 0.9) * 0.08;
    this.island.rotation.z = Math.sin(this.t * 0.6) * 0.006;
    this.stars.rotation.y += dt * 0.004;

    for (const i in this.dev) {
      const d = this.dev[i]; d.cur += (d.goal - d.cur) * Math.min(1, dt * 16); d.pivot.rotation.y = d.cur;
      if (d.crystal) { d.crystal.rotation.y += dt * 0.8; }
    }
    for (const i in this.targets) {
      const t = this.targets[i]; t.lit += (t.goal - t.lit) * Math.min(1, dt * 7);
      t.ringMat.emissiveIntensity = 0.12 + t.lit * 1.7; t.coreMat.opacity = 0.25 + t.lit * 0.75; t.glowMat.opacity = t.lit * (0.32 + Math.sin(this.t * 4) * 0.06);
      t.ring.rotation.y += dt * (0.8 + t.lit * 2.5); const s = 1 + t.lit * 0.22; t.core.scale.setScalar(s * (1 + Math.sin(this.t * 5) * 0.06 * t.lit));
      t.ring.position.y = t.core.position.y = 0.52 + Math.sin(this.t * 2 + +i) * 0.03;
    }
    // beam growth
    const pulse = this.celebrating > 0 ? 1 + Math.sin(this.t * 14) * 0.35 : 1;
    for (const b of this.beams) {
      const g = clamp((nowS - b.t0) / 0.1, 0, 1), L = b.len * g;
      b.g.scale.set(Math.max(0.001, L), pulse, pulse);
      b.g.position.x = b.ax + b.dx * L / 2; b.g.position.z = b.az + b.dz * L / 2;
      // box length is along local X: scale.x = L
    }
    if (this.hintMesh) { const s = 1 + Math.sin(this.t * 7) * 0.12; this.hintMesh.scale.set(s, s, s); this.hintMesh.material.opacity = 0.55 + Math.sin(this.t * 7) * 0.35; }
    for (const i in this.emitHalos || {}) { /* placeholder for future per-emitter pulse */ }
    if (this.celebrating > 0) { this.celebrating -= dt; this.island.rotation.y += dt * 0.35; if (this.celebrating <= 0) this.distTarget = this.baseDist * (this.zoom || 1); }
    else this.island.rotation.y *= 1 - Math.min(1, dt * 3);

    // camera orbit + spring back
    if (!this.holdOrbit || nowS * 1000 - this.holdOrbit > 2500) this.azTarget += (0 - this.azTarget) * Math.min(1, dt * 0.8);
    this.az += (this.azTarget - this.az) * Math.min(1, dt * 8);
    this.dist += (this.distTarget - this.dist) * Math.min(1, dt * 3);
    const el = 0.98, d = this.dist;
    this.camera.position.set(Math.sin(this.az) * Math.cos(el) * d, Math.sin(el) * d + 0.2, Math.cos(this.az) * Math.cos(el) * d);
    this.viewY += (this.viewTarget - this.viewY) * Math.min(1, dt * 3);
    this.camera.lookAt(0, -0.4 + this.viewY, 0.15);

    // particles
    for (let i = 0; i < this.pMax; i++) {
      if (this.pLife[i] <= 0) { this.pPos[i * 3 + 1] = -999; continue; }
      this.pLife[i] -= dt;
      this.pVel[i * 3 + 1] -= 2.6 * dt;
      this.pPos[i * 3] += this.pVel[i * 3] * dt; this.pPos[i * 3 + 1] += this.pVel[i * 3 + 1] * dt; this.pPos[i * 3 + 2] += this.pVel[i * 3 + 2] * dt;
      const f = Math.max(0, Math.min(1, this.pLife[i] * 1.6));
      this.pCol[i * 3] *= 0.97 + f * 0.02; this.pCol[i * 3 + 1] *= 0.97 + f * 0.02; this.pCol[i * 3 + 2] *= 0.97 + f * 0.02;
    }
    this.pGeo.attributes.position.needsUpdate = true; this.pGeo.attributes.color.needsUpdate = true;
  }
}
