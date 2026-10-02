// Pure puzzle logic (no DOM / WebGL): level generation, beam simulation, par + hints.
// Every level is generated *backwards from a solved board*, so it is always solvable.
export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];       // up, right, down, left (y grows downward)
export const COLORS = [0xffd36a, 0xff5d8f, 0x4dd8ff, 0x7dff7a]; // gold, rose, cyan, lime
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** '/' (rot 0) and '\' (rot 1) mirrors. */
export function reflect(dir, rot) {
  const [dx, dy] = DIRS[dir];
  const [nx, ny] = rot === 0 ? [-dy, -dx] : [dy, dx];
  return DIRS.findIndex(([x, y]) => x === nx && y === ny);
}

export function levelSpec(level) {
  const N = clamp(4 + Math.floor((level - 1) / 8), 4, 7);
  const emitters = level < 15 ? 1 : level < 40 ? 2 : 3;
  const maxT = Math.floor(N * N / 5);
  const targets = clamp(1 + Math.floor((level - 1) / 4), emitters, Math.min(maxT, 5));
  return {
    level, N, emitters: Math.min(emitters, targets), targets,
    minDevices: clamp(1 + Math.floor(level / 3), 1, 1 + targets * 2),
    decoys: clamp(Math.floor(level / 4), 0, Math.floor(N * N * 0.25)),
    walls: clamp(Math.floor(level / 6), 0, 4),
  };
}

function attempt(spec, rng) {
  const N = spec.N, idx = (x, y) => y * N + x, inb = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
  let cells = Array.from({ length: N * N }, () => ({ t: 'empty' }));
  let visits = new Array(N * N).fill(0), used = new Array(N * N).fill(false);
  const snap = () => ({ cells: cells.map((c) => ({ ...c })), visits: [...visits], used: [...used] });
  const restore = (s) => { cells = s.cells; visits = s.visits; used = s.used; };
  const pick = (a) => a[Math.floor(rng() * a.length)];

  // emitters on distinct border cells, firing inward
  const trees = [];
  for (let e = 0; e < spec.emitters; e++) {
    let x, y, dir, tries = 0;
    do {
      const side = Math.floor(rng() * 4);
      const k = Math.floor(rng() * N);
      [x, y, dir] = side === 0 ? [k, 0, 2] : side === 1 ? [N - 1, k, 3] : side === 2 ? [k, N - 1, 0] : [0, k, 1];
    } while (used[idx(x, y)] && ++tries < 50);
    if (used[idx(x, y)]) return null;
    cells[idx(x, y)] = { t: 'emit', dir, color: e };
    used[idx(x, y)] = true;
    trees.push({ x, y, dir, color: e, passes: [] });
  }
  // distribute targets: at least one per emitter
  const per = new Array(spec.emitters).fill(1);
  for (let i = spec.emitters; i < spec.targets; i++) per[Math.floor(rng() * spec.emitters)]++;

  function walk(tree, sx, sy, sdir) {
    let x = sx, y = sy, dir = sdir, steps = 0, since = 1;
    while (steps++ < N * N * 2) {
      const nx = x + DIRS[dir][0], ny = y + DIRS[dir][1];
      if (!inb(nx, ny)) return false;
      const i = idx(nx, ny);
      if (used[i]) return false;
      const fresh = visits[i] === 0;
      if (fresh && steps >= 2 && since >= 1 && rng() < 0.3 + steps * 0.04) {
        cells[i] = { t: 'target', color: tree.color }; used[i] = true; return true;
      }
      if (fresh && since >= 1 && rng() < 0.42) {
        const nd = rng() < 0.5 ? (dir + 1) % 4 : (dir + 3) % 4;
        const rot = reflect(dir, 0) === nd ? 0 : 1;
        cells[i] = { t: 'mirror', sol: rot, rot }; used[i] = true;
        x = nx; y = ny; dir = nd; since = 0; continue;
      }
      visits[i]++; tree.passes.push({ x: nx, y: ny, dir });
      x = nx; y = ny; since++;
    }
    return false;
  }

  for (let t = 0; t < trees.length; t++) {
    const tree = trees[t];
    if (!walk(tree, tree.x, tree.y, tree.dir)) return null;
    for (let k = 1; k < per[t]; k++) {
      let ok = false;
      for (let tr = 0; tr < 40 && !ok; tr++) {
        if (!tree.passes.length) break;
        const p = pick(tree.passes), i = idx(p.x, p.y);
        if (used[i] || visits[i] !== 1) continue;
        const side = rng() < 0.5 ? (p.dir + 1) % 4 : (p.dir + 3) % 4;
        const s = snap();
        cells[i] = { t: 'split', sol: side, rot: side }; used[i] = true;
        if (walk(tree, p.x, p.y, side)) ok = true; else restore(s);
      }
      if (!ok) return null;
    }
  }

  const devices = cells.filter((c) => c.t === 'mirror' || c.t === 'split').length;
  if (devices < spec.minDevices) return null;

  // decoys + walls on cells no beam touches in the solved state
  const free = [];
  for (let i = 0; i < N * N; i++) if (!used[i] && visits[i] === 0) free.push(i);
  for (let i = free.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [free[i], free[j]] = [free[j], free[i]]; }
  let fi = 0;
  for (let d = 0; d < spec.decoys && fi < free.length; d++) {
    const rot = rng() < 0.5 ? 0 : 1;
    cells[free[fi++]] = { t: 'mirror', sol: rot, rot, decoy: true };
  }
  for (let w = 0; w < spec.walls && fi < free.length; w++) cells[free[fi++]] = { t: 'wall' };

  const solved = simulate(N, cells);
  if (solved.lit.size !== solved.targets.length) return null;

  // scramble
  for (let tries = 0; tries < 20; tries++) {
    for (const c of cells) {
      if (c.t === 'mirror') c.rot = rng() < 0.6 ? 1 - c.sol : c.sol;
      else if (c.t === 'split') c.rot = rng() < 0.7 ? (c.sol + 1 + Math.floor(rng() * 3)) % 4 : c.sol;
      if (c.decoy) c.rot = rng() < 0.5 ? 0 : 1;
    }
    const sim = simulate(N, cells);
    if (sim.lit.size < sim.targets.length && cellsNeedingMoves(cells).length >= Math.min(2, devices)) {
      return { N, cells, spec, par: parOf(cells) };
    }
  }
  return null;
}

export function generate(level, seedBase = 0) {
  const spec = levelSpec(level);
  const rng = mulberry32((level * 7919 + 13 + seedBase) >>> 0);
  for (let i = 0; i < 500; i++) {
    const p = attempt(spec, rng);
    if (p) return p;
  }
  // extremely unlikely fallback: simpler spec
  return generate(Math.max(1, level - 1), seedBase + 1);
}

export function cellsNeedingMoves(cells) {
  const out = [];
  cells.forEach((c, i) => {
    if ((c.t === 'mirror' && !c.decoy && c.rot !== c.sol) || (c.t === 'split' && c.rot !== c.sol)) out.push(i);
  });
  return out;
}
export function parOf(cells) {
  let n = 0;
  for (const c of cells) {
    if (c.t === 'mirror' && !c.decoy && c.rot !== c.sol) n += 1;
    else if (c.t === 'split') n += (c.sol - c.rot + 4) % 4;
  }
  return Math.max(1, n);
}

/** Trace all beams. Returns segments (cell-space coords), lit targets, and target list. */
export function simulate(N, cells) {
  const segs = [], lit = new Set(), targets = [];
  const idx = (x, y) => y * N + x;
  cells.forEach((c, i) => { if (c.t === 'target') targets.push(i); });
  let order = 0;
  cells.forEach((c, i) => {
    if (c.t !== 'emit') return;
    const queue = [{ x: i % N, y: Math.floor(i / N), dir: c.dir, color: c.color, o: 0 }];
    const seen = new Set();
    let guard = 0;
    while (queue.length && guard++ < 60) {
      const b = queue.shift();
      let { x, y, dir } = b, o = b.o, steps = 0;
      while (steps++ < 200) {
        const key = x + ',' + y + ',' + dir;
        if (seen.has(key)) break;
        seen.add(key);
        const [dx, dy] = DIRS[dir];
        const nx = x + dx, ny = y + dy;
        const add = (ex, ey) => segs.push({ x1: x, y1: y, x2: ex, y2: ey, color: b.color, order: o++ });
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) { add(x + dx * 0.9, y + dy * 0.9); break; }
        const c2 = cells[idx(nx, ny)];
        if (c2.t === 'empty') { add(nx, ny); x = nx; y = ny; continue; }
        if (c2.t === 'mirror') { add(nx, ny); x = nx; y = ny; dir = reflect(dir, c2.rot); continue; }
        if (c2.t === 'split') {
          add(nx, ny); x = nx; y = ny;
          const sd = c2.rot;
          if (sd !== dir && sd !== (dir + 2) % 4) queue.push({ x, y, dir: sd, color: b.color, o });
          continue;
        }
        if (c2.t === 'target') { add(nx, ny); if (c2.color === b.color) lit.add(idx(nx, ny)); break; }
        add(nx - dx * 0.42, ny - dy * 0.42); break; // wall or emitter
      }
    }
    order += 1000;
  });
  return { segs, lit, targets };
}

export function isSolved(N, cells) {
  const s = simulate(N, cells);
  return s.targets.length > 0 && s.lit.size === s.targets.length;
}

/** Cell index of a device that is still wrong (closest to an emitter first). */
export function hint(N, cells) {
  const wrong = cellsNeedingMoves(cells);
  if (!wrong.length) return -1;
  const em = cells.map((c, i) => (c.t === 'emit' ? i : -1)).filter((i) => i >= 0);
  const d = (i) => Math.min(...em.map((e) => Math.abs((e % N) - (i % N)) + Math.abs(Math.floor(e / N) - Math.floor(i / N))));
  wrong.sort((a, b) => d(a) - d(b));
  return wrong[0];
}

export function starsFor(moves, par) {
  return moves <= par ? 3 : moves <= Math.ceil(par * 1.6) + 1 ? 2 : 1;
}
