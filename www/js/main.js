// App controller: screens, input, HUD, shop/missions/daily, ads + IAP flows.
import { Game } from './game.js';
import { AudioEngine } from './audio.js';
import { Store } from './store.js';
import { Ads } from './ads.js';
import { IAP } from './iap.js';
import { SKINS, DAILY_REWARDS, IAP_PRODUCTS } from './config.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.floor(n).toLocaleString('en-IN');
const audio = new AudioEngine();
audio.musicOn = Store.d.music; audio.sfxOn = Store.d.sound;

// ---------------------------------------------------------------- helpers
let toastTimer;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}
function buzz(ms) {
  if (!Store.d.haptics) return;
  try {
    const H = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics;
    if (H) H.vibrate({ duration: ms }); else if (navigator.vibrate) navigator.vibrate(ms);
  } catch (_) {}
}
function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }

// ---------------------------------------------------------------- game
let hudShards = -1, hudScore = -1, hudMult = 1, hudEnergy = -1;
const game = new Game($('stage'), audio, {
  onFrame: updateHud,
  onDead: onDead,
  onStage: (st) => banner('STAGE ' + (st + 1)),
  onEvent: (e, p) => {
    if (e === 'buzz') buzz(p);
    else if (e === 'popup') popup(p.text, p.kind);
    else if (e === 'mult') { const m = $('mult'); m.classList.add('pop'); setTimeout(() => m.classList.remove('pop'), 200); }
  },
});
audio.onBeat = () => { game.pulse = 1; };
game.setSkin(Store.d.skin);
game.setQuality(Store.d.quality);

function banner(text) {
  const b = $('banner'); b.textContent = text; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
}
function popup(text, kind) {
  const p = document.createElement('div'); p.className = 'popup ' + kind; p.textContent = text;
  $('popups').appendChild(p); setTimeout(() => p.remove(), 900);
}
function updateHud(g) {
  if (g.state === 'idle') return;
  const r = g.run;
  if (r.score !== hudScore) { hudScore = r.score; $('score').textContent = fmt(r.score); }
  if (r.mult !== hudMult) { hudMult = r.mult; $('mult').textContent = 'x' + r.mult; }
  if (r.shards !== hudShards) { hudShards = r.shards; $('runShards').textContent = r.shards; }
  const e = Math.round(g.energy);
  if (e !== hudEnergy) {
    hudEnergy = e; $('energyFill').style.width = e + '%';
    $('energyWrap').classList.toggle('low', e < 20);
  }
  $('energyWrap').classList.toggle('active', g.phasing);
}

// ---------------------------------------------------------------- hints (first run teaching)
let hintTimers = [];
function runHints() {
  hintTimers.forEach(clearTimeout); hintTimers = [];
  if (Store.d.seenTutorial) return;
  const h = $('hint');
  const say = (txt, at, len) => {
    hintTimers.push(setTimeout(() => { h.textContent = txt; h.classList.remove('hidden'); }, at));
    hintTimers.push(setTimeout(() => h.classList.add('hidden'), at + len));
  };
  say('SWIPE or TAP sides to shift gravity', 300, 3200);
  say('SWIPE UP to flip across', 4200, 2600);
  say('HOLD to PHASE through walls', 7200, 3200);
  say('Graze walls to recharge energy', 11000, 3000);
  hintTimers.push(setTimeout(() => { Store.d.seenTutorial = true; Store.save(); }, 12000));
}
function stopHints() { hintTimers.forEach(clearTimeout); hintTimers = []; hide('hint'); }

// ---------------------------------------------------------------- flow
let lastRun = null, doubled = false, revived = false, pending = null;

/** Bank the finished run exactly once (revive keeps the run alive, so nothing is banked before this). */
function finalizeRun() {
  if (!pending) return;
  const run = pending; pending = null;
  Store.addShards(run.earned * (doubled ? 2 : 1));
  Store.finishRun(run);
}

function goHome() {
  game.toMenu(); stopHints();
  hide('over'); hide('pause'); hide('hud'); show('home');
  refreshHome();
}
function startGame() {
  audio.unlock(); audio.start();
  hide('home'); hide('over'); hide('pause'); show('hud');
  hudScore = hudShards = hudEnergy = -1; hudMult = 0;
  doubled = false; revived = false;
  game.startRun();
  $('hud').style.display = '';
  runHints();
}
function refreshHome() {
  $('homeShards').textContent = fmt(Store.d.shards);
  $('homeBest').textContent = fmt(Store.d.best);
  $('dailyDot').classList.toggle('hidden', !Store.dailyState().canClaim);
  $('missionDot').classList.toggle('hidden', Store.claimableMissions === 0);
}

async function onDead(run) {
  stopHints();
  lastRun = run;
  const earned = Math.round(run.shards * Store.shardMult);
  run.earned = earned;
  pending = run;                       // banked in finalizeRun() when the player leaves this screen
  const isBest = run.score > Store.d.best;
  hide('hud');
  $('overScore').textContent = fmt(run.score);
  $('overBest').textContent = fmt(Math.max(Store.d.best, run.score));
  $('overShards').textContent = '+' + earned;
  $('overCombo').textContent = 'x' + run.maxMult;
  $('newBest').classList.toggle('hidden', !isBest);
  $('btnRevive').classList.toggle('hidden', run.revived);
  $('btnDouble').classList.toggle('hidden', earned < 5);
  $('btnDouble').disabled = false;
  show('over');
  // Interstitials only when we are NOT offering a revive the player may want first.
  // (Shown when they tap Play Again / Home — see showInterstitialThen.)
}

async function showInterstitialThen(fn) {
  finalizeRun();
  audio.suspend();
  try { await Ads.maybeInterstitial(); } finally { audio.resume(); }
  fn();
}

$('btnPlay').onclick = () => { audio.unlock(); audio.tap(); startGame(); };
$('btnRetry').onclick = () => { audio.tap(); showInterstitialThen(startGame); };
$('btnHome').onclick = () => { audio.tap(); showInterstitialThen(goHome); };
$('btnPause').onclick = () => { game.pause(); show('pause'); };
$('btnResume').onclick = () => { hide('pause'); game.resume(); };
$('btnQuit').onclick = () => { hide('pause'); game.state = 'dead'; onDead(game.run); };

$('btnRevive').onclick = async () => {
  audio.suspend();
  const ok = await Ads.rewarded('Watch to continue your run');
  audio.resume();
  if (!ok) return toast('Ad not completed — no reward');
  audio.reward(); hide('over'); show('hud');
  pending = null;                      // run continues; stats are banked at its real end
  hudMult = 0; hudScore = -1;
  audio.intensity = Math.min(3, game.stage); audio.start();
  game.revive();
};
$('btnDouble').onclick = async () => {
  if (doubled) return;
  audio.suspend();
  const ok = await Ads.rewarded('Double your shards');
  audio.resume();
  if (!ok) return toast('Ad not completed — no reward');
  doubled = true; audio.reward();
  $('overShards').textContent = '+' + lastRun.earned * 2;
  $('btnDouble').disabled = true;
  toast('Shards doubled!');
};

// ---------------------------------------------------------------- input
const stage = $('stage');
let ptr = null, holdTimer = null;
const SWIPE = 34;
function pDown(x, y) {
  audio.unlock();
  if (game.state !== 'play') return;
  ptr = { x, y, ox: x, oy: y, t: performance.now(), moved: false, holding: false };
  holdTimer = setTimeout(() => { if (ptr && !ptr.moved) { ptr.holding = true; game.setHold(true); } }, 170);
}
function pMove(x, y) {
  if (!ptr || game.state !== 'play') return;
  const dx = x - ptr.ox, dy = y - ptr.oy;
  if (Math.abs(dx) > SWIPE && Math.abs(dx) > Math.abs(dy) * 0.8) {
    game.move(dx > 0 ? 1 : -1); ptr.ox = x; ptr.oy = y; ptr.moved = true; clearTimeout(holdTimer);
  } else if (dy < -SWIPE * 1.4 && Math.abs(dy) > Math.abs(dx)) {
    game.flip(); ptr.ox = x; ptr.oy = y; ptr.moved = true; clearTimeout(holdTimer);
  }
}
function pUp(x) {
  if (!ptr) return;
  clearTimeout(holdTimer);
  if (!ptr.moved && !ptr.holding && performance.now() - ptr.t < 220) {
    game.move(x < innerWidth / 2 ? -1 : 1);       // quick tap: left / right half
  }
  game.setHold(false);
  ptr = null;
}
stage.addEventListener('pointerdown', (e) => { stage.setPointerCapture(e.pointerId); pDown(e.clientX, e.clientY); });
stage.addEventListener('pointermove', (e) => pMove(e.clientX, e.clientY));
stage.addEventListener('pointerup', (e) => pUp(e.clientX));
stage.addEventListener('pointercancel', () => { clearTimeout(holdTimer); game.setHold(false); ptr = null; });
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = e.key;
  if (k === 'ArrowLeft' || k === 'a') game.move(-1);
  else if (k === 'ArrowRight' || k === 'd') game.move(1);
  else if (k === 'ArrowUp' || k === 'w') game.flip();
  else if (k === ' ') { e.preventDefault(); game.setHold(true); }
  else if (k === 'Escape' && game.state === 'play') $('btnPause').click();
  else if (k === 'Enter' && !$('home').classList.contains('hidden')) $('btnPlay').click();
});
addEventListener('keyup', (e) => { if (e.key === ' ') game.setHold(false); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { finalizeRun(); if (game.state === 'play') { game.pause(); show('pause'); } audio.suspend(); }
  else if (game.state !== 'paused') audio.resume();
});
document.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------------------------------------------------------------- modals
function openModal(title, html, wire) {
  $('modalTitle').textContent = title; $('modalBody').innerHTML = html; show('modal');
  wire && wire($('modalBody'));
}
function closeModal() { hide('modal'); refreshHome(); }
$('modalClose').onclick = () => { audio.tap(); closeModal(); };

function openDaily() {
  const s = Store.dailyState();
  const days = DAILY_REWARDS.map((r, i) => `<div class="day ${s.canClaim ? (i < s.next ? 'done' : i === s.next ? 'next' : '') : (i < s.next ? 'done' : '')}">Day ${i + 1}<b>${r}</b></div>`).join('');
  openModal('Daily Reward', `
    <div class="days">${days}</div>
    <p style="color:var(--muted);text-align:center;margin:6px 0">Come back every day — the 7th day pays big. Miss a day and the streak resets.</p>
    <button id="claimDaily" class="btn primary" ${s.canClaim ? '' : 'disabled'}>${s.canClaim ? 'CLAIM ' + DAILY_REWARDS[s.next] + ' ◆' : 'Come back tomorrow'}</button>
    ${s.canClaim ? '<button id="claimDaily2" class="btn reward">▶ Watch ad: claim DOUBLE</button>' : ''}`, (b) => {
    const done = (mult) => { const a = Store.claimDaily() * mult; if (mult > 1) Store.addShards(a / 2); audio.reward(); toast('+' + a + ' shards'); closeModal(); };
    b.querySelector('#claimDaily').onclick = () => done(1);
    const d2 = b.querySelector('#claimDaily2');
    if (d2) d2.onclick = async () => { if (await Ads.rewarded('Double daily reward')) done(2); else toast('Ad not completed'); };
  });
}

function openMissions() {
  Store.ensureMissions();
  const html = Store.d.missions.list.map((m, i) => {
    const pct = Math.round(m.progress / m.target * 100);
    const ready = !m.claimed && m.progress >= m.target;
    return `<div class="card"><div class="grow"><b>${m.text.replace('{n}', m.target)}</b>
      <small>${m.progress}/${m.target} · reward ${m.reward} ◆</small><div class="prog"><i style="width:${pct}%"></i></div></div>
      <button class="btn ${ready ? 'primary' : 'ghost'}" data-i="${i}" ${ready ? '' : 'disabled'}>${m.claimed ? '✓' : 'Claim'}</button></div>`;
  }).join('');
  openModal('Daily Missions', html + '<p style="color:var(--muted);text-align:center">New missions every day.</p>', (b) => {
    b.querySelectorAll('button[data-i]').forEach((btn) => btn.onclick = () => {
      const r = Store.claimMission(+btn.dataset.i); if (r) { audio.reward(); toast('+' + r + ' shards'); openMissions(); }
    });
  });
}

function colorCss(s) { return s.rainbow ? 'linear-gradient(135deg,#ff4d4d,#ffd24d,#4dff88,#4dc3ff,#c84dff)' : '#' + s.color.toString(16).padStart(6, '0'); }

function openShop() {
  const d = Store.d;
  const skins = SKINS.map((s) => {
    const owned = Store.owns(s.id), eq = d.skin === s.id;
    let action;
    if (eq) action = '<button class="btn ghost" disabled>Equipped</button>';
    else if (owned) action = `<button class="btn primary" data-eq="${s.id}">Equip</button>`;
    else if (s.iap) action = `<button class="btn reward" data-iap="${s.iap}">${s.priceLabel}</button>`;
    else action = `<button class="btn ghost" data-buy="${s.id}">${s.price} ◆</button>`;
    return `<div class="card"><div class="swatch" style="background:${colorCss(s)};color:${s.rainbow ? '#fff' : colorCss(s)}"></div>
      <div class="grow"><b>${s.name}</b><small>${owned ? 'Owned' : s.iap ? 'Premium' : 'Orb skin'}</small></div>${action}</div>`;
  }).join('');
  const iaps = ['starter_pack', 'remove_ads', 'rift_pass', 'shards_s', 'shards_m', 'shards_l'].filter((id) => !(id === 'remove_ads' && d.noAds) && !(id === 'starter_pack' && d.noAds && Store.owns('prism')))
    .map((id) => { const p = IAP_PRODUCTS[id];
      return `<div class="card"><div class="grow"><b>${p.name}</b><small>${p.desc}</small></div><button class="btn reward" data-iap="${id}">${p.price}</button></div>`; }).join('');
  const free = `<div class="card"><div class="grow"><b>Free shards</b><small>Watch a short ad</small></div><button class="btn primary" data-free="1">+100 ◆</button></div>`;
  openModal('Shop', `<div class="chip" style="align-self:center"><span class="gem">◆</span> <b>${fmt(d.shards)}</b></div>${free}
    <p class="sect">SKINS</p>${skins}<p class="sect">OFFERS</p>${iaps}`, (b) => {
    b.querySelectorAll('[data-eq]').forEach((x) => x.onclick = () => { Store.equip(x.dataset.eq); game.setSkin(x.dataset.eq); audio.tap(); openShop(); });
    b.querySelectorAll('[data-buy]').forEach((x) => x.onclick = () => {
      if (Store.buySkin(x.dataset.buy)) { Store.equip(x.dataset.buy); game.setSkin(x.dataset.buy); audio.reward(); toast('Unlocked!'); } else toast('Not enough shards');
      openShop();
    });
    b.querySelectorAll('[data-iap]').forEach((x) => x.onclick = async () => {
      if (await IAP.buy(x.dataset.iap)) { audio.reward(); toast('Purchase complete'); openShop(); }
    });
    const f = b.querySelector('[data-free]');
    if (f) f.onclick = async () => { if (await Ads.rewarded('Free shards')) { Store.addShards(100); audio.reward(); toast('+100 shards'); openShop(); } else toast('Ad not completed'); };
  });
}

function openSettings() {
  const d = Store.d;
  const row = (k, label) => `<div class="toggle" data-k="${k}"><span>${label}</span><div class="sw ${d[k] ? 'on' : ''}"></div></div>`;
  openModal('Settings', row('music', 'Music') + row('sound', 'Sound effects') + row('haptics', 'Vibration') +
    `<div class="toggle" data-q="1"><span>Graphics</span><b>${d.quality.toUpperCase()}</b></div>
     <button class="btn ghost wide" id="restore">Restore purchases</button>
     <p style="color:var(--muted);text-align:center;font-size:12px">Pulse Rift v1.0 · Best ${fmt(d.best)} · Runs ${d.runs}</p>`, (b) => {
    b.querySelectorAll('[data-k]').forEach((r) => r.onclick = () => {
      const k = r.dataset.k; d[k] = !d[k]; Store.save();
      if (k === 'music') audio.setMusic(d[k]); if (k === 'sound') audio.setSfx(d[k]);
      r.querySelector('.sw').classList.toggle('on', d[k]); audio.tap();
    });
    b.querySelector('[data-q]').onclick = () => {
      const o = ['auto', 'low', 'high']; d.quality = o[(o.indexOf(d.quality) + 1) % 3]; Store.save(); game.setQuality(d.quality); openSettings();
    };
    b.querySelector('#restore').onclick = async () => { await IAP.restore(); toast('Purchases restored'); };
  });
}

$('btnDaily').onclick = () => { audio.unlock(); audio.tap(); openDaily(); };
$('btnMissions').onclick = () => { audio.unlock(); audio.tap(); openMissions(); };
$('btnShop').onclick = () => { audio.unlock(); audio.tap(); openShop(); };
$('btnSettings').onclick = () => { audio.unlock(); audio.tap(); openSettings(); };

// ---------------------------------------------------------------- boot
(async function boot() {
  await Ads.init();
  refreshHome();
  setTimeout(() => $('loading').classList.add('done'), 400);
  if (Store.dailyState().canClaim) setTimeout(() => { if (!$('home').classList.contains('hidden')) toast('🎁 Daily reward is ready!'); }, 1500);
  // Allow tests / debugging
  window.__game = game;
})();
