// Ad abstraction. On the web (dev/preview) it shows a fake "demo ad" overlay.
// Inside the Capacitor app it uses @capacitor-community/admob with Google's test ids
// from config.js until you swap in your own AdMob ids.
import { AD_IDS } from './config.js';
import { Store } from './store.js';

const cap = () => window.Capacitor;
const native = () => !!(cap() && cap().isNativePlatform && cap().isNativePlatform());
const plugin = () => cap() && cap().Plugins && cap().Plugins.AdMob;
const platform = () => (cap() && cap().getPlatform && cap().getPlatform()) === 'ios' ? 'ios' : 'android';

let deathsSinceAd = 0;
let lastInterstitial = 0;
let ready = false;

function demoAd(label) {
  return new Promise((resolve) => {
    const el = document.getElementById('adOverlay');
    const txt = document.getElementById('adText');
    const btn = document.getElementById('adClose');
    let left = 3;
    txt.textContent = label;
    btn.disabled = true; btn.textContent = `Reward in ${left}…`;
    el.classList.remove('hidden');
    const iv = setInterval(() => {
      left--;
      if (left > 0) btn.textContent = `Reward in ${left}…`;
      else { clearInterval(iv); btn.disabled = false; btn.textContent = 'Claim ✓'; }
    }, 1000);
    btn.onclick = () => { clearInterval(iv); el.classList.add('hidden'); resolve(left <= 0); };
  });
}

function nativeShow(kind) {
  // Resolves true when the user earned the reward / the interstitial closed.
  const AdMob = plugin();
  const id = AD_IDS[platform()][kind];
  return new Promise(async (resolve) => {
    let earned = false;
    const subs = [];
    const done = (v) => { subs.forEach((s) => s && s.remove && s.remove()); resolve(v); };
    try {
      if (kind === 'rewarded') {
        subs.push(await AdMob.addListener('onRewardedVideoAdReward', () => { earned = true; }));
        subs.push(await AdMob.addListener('onRewardedVideoAdDismissed', () => done(earned)));
        subs.push(await AdMob.addListener('onRewardedVideoAdFailedToShow', () => done(false)));
        await AdMob.prepareRewardVideoAd({ adId: id });
        await AdMob.showRewardVideoAd();
      } else {
        subs.push(await AdMob.addListener('onInterstitialAdDismissed', () => done(true)));
        subs.push(await AdMob.addListener('onInterstitialAdFailedToShow', () => done(false)));
        await AdMob.prepareInterstitial({ adId: id });
        await AdMob.showInterstitial();
      }
    } catch (e) { console.warn('ad error', e); done(false); }
  });
}

export const Ads = {
  async init() {
    if (native() && plugin()) {
      try { await plugin().initialize({ initializeForTesting: true }); ready = true; } catch (e) { console.warn(e); }
    } else ready = true;
  },
  /** Rewarded video. Resolves true if the player earned the reward. */
  async rewarded(label = 'Rewarded ad') {
    if (native() && plugin()) return nativeShow('rewarded');
    return demoAd(label);
  },
  /** Call on every death. Shows an interstitial only when it won't annoy the player. */
  async maybeInterstitial() {
    if (Store.d.noAds) return false;
    deathsSinceAd++;
    const now = Date.now();
    if (Store.d.runs < AD_IDS.firstInterstitialAfterRuns) return false;
    if (deathsSinceAd < AD_IDS.interstitialEveryNDeaths) return false;
    if (now - lastInterstitial < AD_IDS.interstitialMinGapMs) return false;
    deathsSinceAd = 0; lastInterstitial = now;
    if (native() && plugin()) return nativeShow('interstitial');
    return demoAd('Interstitial ad (skippable in demo)');
  },
};
