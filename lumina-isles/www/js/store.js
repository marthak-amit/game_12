// Persistent save data.
import { CFG, THEMES } from './config.js';
const KEY = 'luminaisles_save_v1';
const DEFAULTS = {
  level: 1, stars: {}, gems: 0, hints: CFG.startHints, theme: 'aurora', themes: ['aurora'],
  noAds: false, passUntil: 0, sound: true, music: true, haptics: true, seenIntro: {},
  daily: { last: '', streak: 0, solvedDay: '' },
};
const today = () => new Date().toISOString().slice(0, 10);
const dayNum = (s) => Math.floor(Date.parse(s + 'T00:00:00Z') / 864e5);

class StoreImpl {
  constructor() {
    this.d = JSON.parse(JSON.stringify(DEFAULTS));
    try { const raw = localStorage.getItem(KEY); if (raw) this.d = { ...this.d, ...JSON.parse(raw) }; } catch (_) {}
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.d)); } catch (_) {} }
  get passActive() { return this.d.passUntil > Date.now(); }
  get gemMult() { return this.passActive ? 2 : 1; }
  addGems(n) { this.d.gems += n; this.save(); }
  get totalStars() { return Object.values(this.d.stars).reduce((a, b) => a + b, 0); }

  hasTheme(id) { return this.d.themes.includes(id); }
  unlockTheme(id) { if (!this.hasTheme(id)) this.d.themes.push(id); this.save(); }
  buyTheme(id) {
    const t = THEMES.find((x) => x.id === id);
    if (!t || t.iap || this.hasTheme(id) || this.d.gems < t.price) return false;
    this.d.gems -= t.price; this.unlockTheme(id); return true;
  }
  equip(id) { if (this.hasTheme(id)) { this.d.theme = id; this.save(); } }

  /** Record a level completion; returns { first, gems, stars, improved }. */
  complete(level, stars, daily = false) {
    const prev = this.d.stars[level] || 0;
    const first = !prev && !daily;
    let gems = 0;
    if (!daily) {
      this.d.stars[level] = Math.max(prev, stars);
      if (level === this.d.level) this.d.level++;
      if (first) gems = Math.round((CFG.gemsPerLevel + CFG.gemsPerStar * stars) * this.gemMult);
      else if (stars > prev) gems = Math.round(CFG.gemsPerStar * (stars - prev) * this.gemMult);
    }
    if (gems) this.d.gems += gems;
    this.save();
    return { first, gems, stars };
  }

  // daily puzzle
  dailyInfo() {
    const t = today(), { last, streak, solvedDay } = this.d.daily;
    const gap = last ? dayNum(t) - dayNum(last) : 99;
    return { day: t, solved: solvedDay === t, streak: gap <= 1 ? streak : 0 };
  }
  completeDaily() {
    const info = this.dailyInfo();
    if (info.solved) return 0;
    const streak = info.streak + 1;
    const gems = Math.round((CFG.dailyGems + CFG.dailyStreakBonus * Math.min(7, streak)) * this.gemMult);
    this.d.daily = { last: info.day, streak, solvedDay: info.day };
    this.addGems(gems); return gems;
  }
}
export const Store = new StoreImpl();
