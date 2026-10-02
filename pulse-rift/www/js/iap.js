// In-app purchase abstraction. On the web it simulates a successful purchase after a confirm().
// For the real store, wire `nativePurchase` to cordova-plugin-purchase or RevenueCat (see README).
import { IAP_PRODUCTS } from './config.js';
import { Store } from './store.js';

const cap = () => window.Capacitor;
const native = () => !!(cap() && cap().isNativePlatform && cap().isNativePlatform());

async function nativePurchase(productId) {
  // TODO(store): call your IAP plugin here and resolve true only on a verified purchase.
  // Example with cordova-plugin-purchase: CdvPurchase.store.order(offer) -> approved -> finish().
  const iap = window.CdvPurchase && window.CdvPurchase.store;
  if (!iap) throw new Error('IAP plugin not installed');
  throw new Error('Wire nativePurchase to your store plugin for ' + productId);
}

function grant(id) {
  const d = Store.d;
  switch (id) {
    case 'remove_ads': d.noAds = true; break;
    case 'starter_pack': d.noAds = true; Store.addShards(5000); Store.unlock('prism'); break;
    case 'shards_s': Store.addShards(1500); break;
    case 'shards_m': Store.addShards(5000); break;
    case 'shards_l': Store.addShards(14000); break;
    case 'skin_prism': Store.unlock('prism'); break;
    case 'skin_solar': Store.unlock('solar'); break;
    case 'rift_pass': d.passUntil = Math.max(Date.now(), d.passUntil) + 30 * 864e5; break;
    default: return false;
  }
  Store.save();
  return true;
}

export const IAP = {
  products: IAP_PRODUCTS,
  async buy(id) {
    const p = IAP_PRODUCTS[id];
    if (!p) return false;
    let ok;
    if (native()) ok = await nativePurchase(id);
    else ok = window.confirm(`DEMO purchase\n${p.name} — ${p.price}\n\n(No real money is charged on web preview.)`);
    return ok ? grant(id) : false;
  },
  async restore() { return native() ? false : true; },
};
