// Lumina Isles controller: flow, HUD, hints, daily puzzle, store, ads/IAP hooks.
import { IsleScene } from './scene.js';
import { AudioEngine } from './audio.js';
import { Store } from './store.js';
import { Ads } from './ads.js';
import { IAP } from './iap.js';
import { THEMES, IAP_PRODUCTS, CFG } from './config.js';
import { generate, simulate, isSolved, hint as findHint, starsFor } from './puzzle.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.floor(n).toLocaleString('en-IN');
const audio = new AudioEngine();
audio.musicOn = Store.d.music; audio.sfxOn = Store.d.sound;
const theme = () => THEMES.find((t) => t.id === Store.d.theme) || THEMES[0];

let toastTimer;
function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200); }
function buzz(ms) {
  if (!Store.d.haptics) return;
  try { const H = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics; if (H) H.vibrate({ duration: ms }); else if (navigator.vibrate) navigator.vibrate(ms); } catch (_) {}
}
const show = (id) => $(id).classList.remove('hidden');
const hide = (id) => $(id).classList.add('hidden');
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

// ------------------------------------------------------------------ game state
let G = null;            // { level, daily, puzzle, init:[rots], moves, solved, result }
const cache = {};

const scene = new IsleScene($('stage'), { onTap: (i) => tapCell(i) });
scene.applyTheme(theme());

function dailyLevel() { const n = Math.floor(Date.now() / 864e5); return { level: 12 + (n % 14), seed: n * 31 }; }
function puzzleFor(level, seed = 0) {
  const k = level + ':' + seed;
  if (cache[k]) { const p = cache[k]; delete cache[k]; return p; }
  return generate(level, seed);
}
function prefetch(level, seed = 0) {
  const k = level + ':' + seed; if (cache[k]) return;
  setTimeout(() => { try { cache[k] = generate(level, seed); } catch (_) {} }, 1200);
}

async function startLevel(level, daily = false) {
  audio.unlock(); audio.start();
  hide('home'); hide('win'); hide('modal'); show('hud'); scene.setHome(false);
  $('lvlTitle').textContent = daily ? 'Daily Puzzle' : 'Level ' + level;
  $('tip').classList.add('hidden');
  await nextFrame();
  const dl = daily ? dailyLevel() : null;
  const p = daily ? generate(dl.level, dl.seed) : puzzleFor(level);
  G = { level, daily, puzzle: p, init: p.cells.map((c) => c.rot), moves: 0, solved: false, par: p.par, hinted: false };
  scene.load(p, theme());
  scene.showBeams(simulate(p.N, p.cells));
  updateHud(); showTip(level, daily);
  if (!daily) prefetch(level + 1);
}
function restart() {
  if (!G) return;
  G.puzzle.cells.forEach((c, i) => { if (c.rot !== undefined) c.rot = G.init[i]; });
  G.moves = 0; G.solved = false; scene.stopCelebrate(); scene.load(G.puzzle, theme());
  scene.showBeams(simulate(G.puzzle.N, G.puzzle.cells), true); updateHud();
}

const TIPS = { 1: 'Tap a mirror to rotate it.\nLight every ring target.', 2: 'Beams bounce off mirrors.\nTry to use as few taps as you can ★', 3: 'Crystal prisms split a beam\nin two — tap to aim the branch.', 6: 'Rings only light up for beams\nof the SAME colour.' };
function showTip(level, daily) {
  const t = $('tip'), txt = !daily && TIPS[level];
  if (txt && !Store.d.seenIntro[level]) { t.textContent = txt; t.style.whiteSpace = 'pre-line'; t.classList.remove('hidden'); }
  else t.classList.add('hidden');
}
function updateHud() {
  $('moves').textContent = G.moves; $('par').textContent = G.par; $('hudGems').textContent = fmt(Store.d.gems);
  const s = starsFor(G.moves, G.par);
  [...$('starRow').children].forEach((el, i) => el.classList.toggle('on', i < s));
  const n = Store.d.hints;
  $('hintLbl').textContent = Store.passActive ? '∞' : n > 0 ? n + ' left' : 'Hint';
}

function tapCell(i) {
  if (!G || G.solved) return;
  const c = G.puzzle.cells[i];
  if (c.t === 'mirror') c.rot = 1 - c.rot; else if (c.t === 'split') c.rot = (c.rot + 1) % 4; else return;
  G.moves++; scene.rotateCell(i); scene.clearHint(); audio.tap(G.moves); buzz(8);
  if (!Store.d.seenIntro[G.level] && !G.daily) { Store.d.seenIntro[G.level] = 1; Store.save(); $('tip').classList.add('hidden'); }
  const sim = simulate(G.puzzle.N, G.puzzle.cells);
  const newly = scene.showBeams(sim);
  newly.forEach((t, k) => setTimeout(() => { audio.lit(sim.lit.size - newly.length + k); scene.burstTarget(t); buzz(20); }, 220 + k * 120));
  updateHud();
  if (sim.targets.length && sim.lit.size === sim.targets.length) win();
}

async function win() {
  G.solved = true;
  const stars = starsFor(G.moves, G.par);
  G.stars = stars;
  setTimeout(() => { scene.celebrate(); audio.win(); buzz(60); }, 450);
  let gems = 0;
  if (G.daily) gems = Store.completeDaily(); else gems = Store.complete(G.level, stars).gems;
  G.gems = gems;
  setTimeout(() => {
    $('winTitle').textContent = G.daily ? 'DAILY COMPLETE' : 'ISLAND AWAKENED';
    $('winMoves').textContent = G.moves; $('winPar').textContent = G.par;
    $('winGems').textContent = '+' + gems;
    $('btnDouble').classList.toggle('hidden', gems < 5); $('btnDouble').disabled = false;
    $('btnReplay').classList.toggle('hidden', stars === 3 || G.daily);
    $('btnNext').textContent = G.daily ? 'DONE' : 'NEXT ISLAND ›';
    const row = $('winStars'); [...row.children].forEach((el) => el.classList.remove('show'));
    show('win'); hide('hud');
    [...row.children].forEach((el, i) => { if (i < stars) setTimeout(() => { el.classList.add('show'); audio.tap(i * 2); }, 250 + i * 300); });
  }, 1700);
}

// ------------------------------------------------------------------ buttons
$('btnRestart').onclick = () => { audio.ui(); restart(); };
$('btnMenu').onclick = () => { audio.ui(); goHome(); };

$('btnHint').onclick = async () => {
  if (!G || G.solved) return;
  audio.unlock();
  const free = Store.passActive || Store.d.hints > 0;
  if (!free) return openHintShop();
  if (!Store.passActive) { Store.d.hints--; Store.save(); }
  const i = findHint(G.puzzle.N, G.puzzle.cells);
  if (i < 0) return toast('Looks right already — keep trying other mirrors!');
  scene.setHint(i); audio.hint(); updateHud();
  toast('Tap the glowing device');
};
function openHintShop() {
  openModal('Need a hint?', `
    <p style="color:var(--muted);text-align:center;margin:0">Out of hints. Get more:</p>
    <button class="btn reward" id="hAd">▶ Watch ad: +${CFG.hintsPerAd} hints</button>
    <button class="btn ghost" id="hGem">Spend ${CFG.hintGemCost} ◆ for 1 hint</button>
    <button class="btn primary" id="hBuy">10 hints — ${IAP_PRODUCTS.hints_s.price}</button>`, (b) => {
    b.querySelector('#hAd').onclick = async () => {
      audio.suspend(); const ok = await Ads.rewarded('Watch for free hints'); audio.resume();
      if (ok) { Store.d.hints += CFG.hintsPerAd; Store.save(); audio.reward(); closeModal(); updateHud(); toast('+' + CFG.hintsPerAd + ' hints'); } else toast('Ad not completed');
    };
    b.querySelector('#hGem').onclick = () => {
      if (Store.d.gems < CFG.hintGemCost) return toast('Not enough gems');
      Store.d.gems -= CFG.hintGemCost; Store.d.hints += 1; Store.save(); closeModal(); updateHud(); toast('+1 hint');
    };
    b.querySelector('#hBuy').onclick = async () => { if (await IAP.buy('hints_s')) { audio.reward(); closeModal(); updateHud(); } };
  });
}

$('btnSkip').onclick = async () => {
  if (!G || G.solved || G.daily) return toast(G && G.daily ? "Can't skip the daily" : '');
  audio.suspend(); const ok = await Ads.rewarded('Watch to skip this island'); audio.resume();
  if (!ok) return toast('Ad not completed');
  Store.complete(G.level, 1); audio.reward(); startLevel(G.level + 1);
};

$('btnNext').onclick = async () => {
  audio.ui();
  const lvl = G.level, daily = G.daily;
  if (!daily) { audio.suspend(); try { await Ads.maybeInterstitial(lvl); } finally { audio.resume(); } }
  scene.stopCelebrate();
  if (daily) goHome(); else startLevel(Store.d.level);
};
$('btnReplay').onclick = () => { audio.ui(); hide('win'); show('hud'); restart(); };
$('btnWinHome').onclick = () => { audio.ui(); goHome(); };
$('btnDouble').onclick = async () => {
  audio.suspend(); const ok = await Ads.rewarded('Double your gems'); audio.resume();
  if (!ok) return toast('Ad not completed');
  Store.addGems(G.gems); $('winGems').textContent = '+' + G.gems * 2; $('btnDouble').disabled = true; audio.reward(); toast('Gems doubled!');
};

function goHome() {
  G = null; scene.setHome(true); scene.stopCelebrate(); hide('hud'); hide('win'); hide('modal'); show('home'); refreshHome();
  // decorative island on the title screen
  const p = generate(1 + (Store.d.level % 9), 99); scene.load(p, theme()); scene.showBeams(simulate(p.N, p.cells), true);
  scene.island.rotation.y = 0;
}
function refreshHome() {
  $('homeGems').textContent = fmt(Store.d.gems); $('homeStars').textContent = fmt(Store.totalStars);
  $('playLvl').textContent = 'Level ' + Store.d.level;
  $('dailyDot').classList.toggle('hidden', Store.dailyInfo().solved);
}
$('btnPlay').onclick = () => { audio.unlock(); audio.ui(); startLevel(Store.d.level); };

// ------------------------------------------------------------------ modals
function openModal(title, html, wire) { $('modalTitle').textContent = title; $('modalBody').innerHTML = html; show('modal'); wire && wire($('modalBody')); }
function closeModal() { hide('modal'); if (!G) refreshHome(); }
$('modalClose').onclick = () => { audio.ui(); closeModal(); };

$('btnDaily').onclick = () => {
  audio.unlock(); audio.ui(); const d = Store.dailyInfo();
  const reward = CFG.dailyGems + CFG.dailyStreakBonus * Math.min(7, d.streak + 1);
  openModal('Daily Puzzle', `
    <div class="card"><div class="grow"><b>🔥 ${d.streak}-day streak</b><small>Solve every day — bonus grows up to 7 days</small></div></div>
    <p style="color:var(--muted);text-align:center;margin:4px 0">A fresh, bigger puzzle every day — the same for everyone.</p>
    <div class="reward-line"><span class="gem">◆</span> ${d.solved ? 'Done today ✓' : '+' + reward}</div>
    <button class="btn primary" id="dGo">${d.solved ? 'Play again (no reward)' : 'START DAILY'}</button>`, (b) => {
    b.querySelector('#dGo').onclick = () => startLevel(0, true);
  });
};
$('btnLevels').onclick = () => {
  audio.unlock(); audio.ui(); const cur = Store.d.level; let h = '';
  for (let i = 1; i <= cur + 4; i++) {
    const s = Store.d.stars[i] || 0, lock = i > cur;
    h += `<div class="lv ${i === cur ? 'cur' : ''} ${lock ? 'lock' : ''}" data-l="${lock ? '' : i}">${lock ? '🔒' : i}<small>${'★'.repeat(s)}</small></div>`;
  }
  openModal('Levels', `<div class="lvlgrid">${h}</div>`, (b) => b.querySelectorAll('.lv[data-l]').forEach((el) => { if (el.dataset.l) el.onclick = () => startLevel(+el.dataset.l); }));
};

const css = (n) => '#' + n.toString(16).padStart(6, '0');
function openStore() {
  const d = Store.d;
  const themes = THEMES.map((t) => {
    const own = Store.hasTheme(t.id), eq = d.theme === t.id;
    const act = eq ? '<button class="btn ghost" disabled>Equipped</button>' : own ? `<button class="btn primary" data-eq="${t.id}">Equip</button>`
      : t.iap ? `<button class="btn reward" data-iap="${t.iap}">${t.priceLabel}</button>` : `<button class="btn ghost" data-buy="${t.id}">${t.price} ◆</button>`;
    return `<div class="card"><div class="swatch" style="background:linear-gradient(135deg,${css(t.bgBot)},${css(t.tileA)} 60%,${css(t.accent)})"></div>
      <div class="grow"><b>${t.name}</b><small>${own ? 'Owned' : t.iap ? 'Premium' : 'Island theme'}</small></div>${act}</div>`;
  }).join('');
  const ids = ['starter_pack', 'remove_ads', 'lumen_pass', 'hints_s', 'hints_m', 'gems_m'].filter((id) => !(id === 'remove_ads' && d.noAds));
  const offers = ids.map((id) => { const p = IAP_PRODUCTS[id]; return `<div class="card"><div class="grow"><b>${p.name}</b><small>${p.desc}</small></div><button class="btn reward" data-iap="${id}">${p.price}</button></div>`; }).join('');
  openModal('Store', `<div class="chip" style="align-self:center"><span class="gem">◆</span> <b>${fmt(d.gems)}</b> &nbsp;·&nbsp; 💡 <b>${d.hints}</b></div>
    <div class="card"><div class="grow"><b>Free gems</b><small>Watch a short ad</small></div><button class="btn primary" data-free="1">+60 ◆</button></div>
    <p class="sect">OFFERS</p>${offers}<p class="sect">ISLAND THEMES</p>${themes}`, (b) => {
    b.querySelectorAll('[data-eq]').forEach((x) => x.onclick = () => { Store.equip(x.dataset.eq); scene.applyTheme(theme()); audio.ui(); openStore(); });
    b.querySelectorAll('[data-buy]').forEach((x) => x.onclick = () => { if (Store.buyTheme(x.dataset.buy)) { Store.equip(x.dataset.buy); scene.applyTheme(theme()); audio.reward(); toast('Unlocked!'); } else toast('Not enough gems'); openStore(); });
    b.querySelectorAll('[data-iap]').forEach((x) => x.onclick = async () => { if (await IAP.buy(x.dataset.iap)) { audio.reward(); toast('Purchase complete'); openStore(); } });
    const f = b.querySelector('[data-free]');
    if (f) f.onclick = async () => { audio.suspend(); const ok = await Ads.rewarded('Free gems'); audio.resume(); if (ok) { Store.addGems(60); audio.reward(); toast('+60 gems'); openStore(); } else toast('Ad not completed'); };
  });
}
$('btnStore').onclick = () => { audio.unlock(); audio.ui(); openStore(); };

$('btnSettings').onclick = () => {
  audio.unlock(); audio.ui(); const d = Store.d;
  const row = (k, l) => `<div class="toggle" data-k="${k}"><span>${l}</span><div class="sw ${d[k] ? 'on' : ''}"></div></div>`;
  openModal('Settings', row('music', 'Music') + row('sound', 'Sound effects') + row('haptics', 'Vibration') +
    `<button class="btn ghost wide" id="restore">Restore purchases</button>
     <p style="color:var(--muted);text-align:center;font-size:12px">Lumina Isles v1.0 · Level ${d.level} · ★ ${Store.totalStars}</p>`, (b) => {
    b.querySelectorAll('[data-k]').forEach((r) => r.onclick = () => {
      const k = r.dataset.k; d[k] = !d[k]; Store.save(); if (k === 'music') audio.setMusic(d[k]); if (k === 'sound') audio.setSfx(d[k]);
      r.querySelector('.sw').classList.toggle('on', d[k]); audio.ui();
    });
    b.querySelector('#restore').onclick = async () => { await IAP.restore(); toast('Purchases restored'); };
  });
};

document.addEventListener('visibilitychange', () => { if (document.hidden) audio.suspend(); else audio.resume(); });
document.addEventListener('contextmenu', (e) => e.preventDefault());

// ------------------------------------------------------------------ boot
(async function boot() {
  await Ads.init();
  goHome();
  setTimeout(() => $('loading').classList.add('done'), 500);
  if (!Store.dailyInfo().solved) setTimeout(() => { if (!G && !$('home').classList.contains('hidden')) toast('📅 Today\'s daily puzzle is ready!'); }, 1600);
  window.__scene = scene; window.__state = () => G; window.__tap = tapCell;
})();
