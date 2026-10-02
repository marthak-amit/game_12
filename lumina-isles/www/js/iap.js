// IAP abstraction: simulated on web, wire `nativePurchase` to RevenueCat / cordova-plugin-purchase for stores.
import { IAP_PRODUCTS } from './config.js';
import { Store } from './store.js';

const cap = () => window.Capacitor;
const native = () => !!(cap() && cap().isNativePlatform && cap().isNativePlatform());

async function nativePurchase(productId) {
  // TODO(store): call your IAP plugin; resolve true only for a verified purchase.
  throw new Error('Wire nativePurchase to your store plugin for ' + productId);
}

function grant(id) {
  const d = Store.d;
  switch (id) {
    case 'remove_ads': d.noAds = true; break;
    case 'starter_pack': d.noAds = true; d.hints += 20; Store.addGems(500); break;
    case 'hints_s': d.hints += 10; break;
    case 'hints_m': d.hints += 30; break;
    case 'gems_m': Store.addGems(1000); break;
    case 'theme_cosmos': Store.unlockTheme('cosmos'); break;
    case 'lumen_pass': d.passUntil = Math.max(Date.now(), d.passUntil) + 30 * 864e5; break;
    default: return false;
  }
  Store.save(); return true;
}

export const IAP = {
  products: IAP_PRODUCTS,
  async buy(id) {
    const p = IAP_PRODUCTS[id]; if (!p) return false;
    const ok = native() ? await nativePurchase(id)
      : window.confirm(`DEMO purchase\n${p.name} — ${p.price}\n\n(No real money is charged on web preview.)`);
    return ok ? grant(id) : false;
  },
  async restore() { return true; },
};
