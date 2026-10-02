// Persistent player data: currency, skins, daily reward, daily missions, settings.
import { DAILY_REWARDS, SKINS } from './config.js';

const KEY = 'pulserift_save_v1';

const DEFAULTS = {
  shards: 0, best: 0, runs: 0, deaths: 0, totalShards: 0, bestCombo: 0,
  skin: 'nova', owned: ['nova'],
  noAds: false, passUntil: 0,
  sound: true, music: true, haptics: true, quality: 'auto',
  seenTutorial: false,
  daily: { last: '', streak: 0 },
  missions: { day: '', list: [] },
};

const MISSION_POOL = [
  { type: 'score',  text: 'Score {n} in a single run',   targets: [1500, 3000, 6000],  reward: [60, 100, 180] },
  { type: 'shards', text: 'Collect {n} shards',          targets: [60, 120, 250],      reward: [50, 90, 160] },
  { type: 'graze',  text: 'Graze walls {n} times',       targets: [10, 25, 50],        reward: [60, 100, 170] },
  { type: 'combo',  text: 'Reach a x{n} multiplier',     targets: [3, 5, 8],           reward: [60, 110, 200] },
  { type: 'gates',  text: 'Phase through {n} gates',     targets: [3, 8, 15],          reward: [60, 100, 170] },
  { type: 'runs',   text: 'Play {n} runs',               targets: [3, 6, 10],          reward: [40, 70, 120] },
];

const today = () => new Date().toISOString().slice(0, 10);
const dayNum = (s) => Math.floor(Date.parse(s + 'T00:00:00Z') / 864e5);

function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

class StoreImpl {
  constructor() {
    this.d = JSON.parse(JSON.stringify(DEFAULTS));
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.d = { ...this.d, ...JSON.parse(raw) };
    } catch (_) { /* private mode etc. */ }
    this.ensureMissions();
  }

  save() { try { localStorage.setItem(KEY, JSON.stringify(this.d)); } catch (_) {} }

  get passActive() { return this.d.passUntil > Date.now(); }
  get shardMult() { return this.passActive ? 1.5 : 1; }

  addShards(n) {
    this.d.shards += n;
    if (n > 0) this.d.totalShards += n;
    this.save();
  }
  spend(n) {
    if (this.d.shards < n) return false;
    this.d.shards -= n; this.save(); return true;
  }

  // ---- skins
  owns(id) { return this.d.owned.includes(id); }
  unlock(id) { if (!this.owns(id)) this.d.owned.push(id); this.save(); }
  buySkin(id) {
    const s = SKINS.find((k) => k.id === id);
    if (!s || this.owns(id) || s.iap) return false;
    if (!this.spend(s.price)) return false;
    this.unlock(id); return true;
  }
  equip(id) { if (this.owns(id)) { this.d.skin = id; this.save(); } }

  // ---- daily reward
  dailyState() {
    const t = today(), { last, streak } = this.d.daily;
    if (last === t) return { canClaim: false, streak, next: streak % 7 };
    const gap = last ? dayNum(t) - dayNum(last) : 99;
    const cur = gap === 1 ? streak : 0;
    return { canClaim: true, streak: cur, next: cur % 7 };
  }
  claimDaily() {
    const s = this.dailyState();
    if (!s.canClaim) return 0;
    const amt = DAILY_REWARDS[s.next];
    this.d.daily = { last: today(), streak: s.streak + 1 };
    this.addShards(amt);
    return amt;
  }

  // ---- missions
  ensureMissions() {
    const t = today();
    if (this.d.missions.day === t && this.d.missions.list.length) return;
    const rnd = seeded(dayNum(t) * 2654435761);
    const pool = [...MISSION_POOL];
    const list = [];
    for (let i = 0; i < 3; i++) {
      const m = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
      list.push({ type: m.type, text: m.text, target: m.targets[i], reward: m.reward[i], progress: 0, claimed: false });
    }
    this.d.missions = { day: t, list };
    this.save();
  }
  report(run) {
    this.ensureMissions();
    for (const m of this.d.missions.list) {
      if (m.claimed) continue;
      if (m.type === 'score') m.progress = Math.max(m.progress, run.score);
      else if (m.type === 'combo') m.progress = Math.max(m.progress, run.maxMult);
      else if (m.type === 'shards') m.progress += run.shards;
      else if (m.type === 'graze') m.progress += run.grazes;
      else if (m.type === 'gates') m.progress += run.gates;
      else if (m.type === 'runs') m.progress += 1;
      m.progress = Math.min(m.progress, m.target);
    }
    this.save();
  }
  claimMission(i) {
    const m = this.d.missions.list[i];
    if (!m || m.claimed || m.progress < m.target) return 0;
    m.claimed = true; this.addShards(m.reward); return m.reward;
  }
  get claimableMissions() {
    return this.d.missions.list.filter((m) => !m.claimed && m.progress >= m.target).length;
  }

  // ---- finish a run
  finishRun(run) {
    const d = this.d;
    d.runs++; d.deaths++;
    const isBest = run.score > d.best;
    if (isBest) d.best = run.score;
    d.bestCombo = Math.max(d.bestCombo, run.maxMult);
    this.report(run);
    this.save();
    return { isBest };
  }
}

export const Store = new StoreImpl();
