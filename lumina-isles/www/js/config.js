// Tuning, themes, products. Edit numbers here to rebalance the game.
export const CFG = {
  startHints: 3,
  hintsPerAd: 2,
  gemsPerLevel: 10,
  gemsPerStar: 5,
  hintGemCost: 30,
  dailyGems: 60,
  dailyStreakBonus: 10,   // extra gems per streak day (max 7)
  interstitialEveryNLevels: 3,
  firstInterstitialAfterLevel: 4,
  interstitialMinGapMs: 75000,
};

// Island themes (colours as hex ints). First is free.
export const THEMES = [
  { id: 'aurora',  name: 'Aurora',      price: 0,   bgTop: 0x0b1030, bgBot: 0x1c0f3f, tileA: 0x2e3f7a, tileB: 0x233266, rock: 0x2b2f55, accent: 0x7be0ff },
  { id: 'sunset',  name: 'Sunset',      price: 150, bgTop: 0x2a0f3a, bgBot: 0x6b1f4a, tileA: 0x5a2a55, tileB: 0x4a2048, rock: 0x4b2a4a, accent: 0xffb36b },
  { id: 'jade',    name: 'Jade Garden', price: 300, bgTop: 0x06241f, bgBot: 0x0e3b33, tileA: 0x1e5a4c, tileB: 0x184a3e, rock: 0x23403a, accent: 0x7dffb0 },
  { id: 'frost',   name: 'Frostbite',   price: 500, bgTop: 0x0a2236, bgBot: 0x1d4b6b, tileA: 0x3d7da0, tileB: 0x2f6a8c, rock: 0x35607c, accent: 0xcdf3ff },
  { id: 'ember',   name: 'Ember',       price: 800, bgTop: 0x220a0a, bgBot: 0x4a1410, tileA: 0x5a2420, tileB: 0x481c19, rock: 0x3d1d1a, accent: 0xff7a4d },
  { id: 'cosmos',  name: 'Cosmos',      iap: 'theme_cosmos', priceLabel: '₹99', bgTop: 0x03000d, bgBot: 0x14003a, tileA: 0x2a1b66, tileB: 0x1c1247, rock: 0x241a52, accent: 0xff5de4 },
];

export const IAP_PRODUCTS = {
  remove_ads:    { name: 'Remove Ads',      desc: 'No interstitial ads. Hints via ads stay optional.', price: '₹199' },
  starter_pack:  { name: 'Starter Pack',    desc: '20 hints + 500 gems + Remove Ads',                  price: '₹149' },
  hints_s:       { name: '10 Hints',        desc: 'Never get stuck',                                   price: '₹49'  },
  hints_m:       { name: '30 Hints',        desc: 'Best value',                                        price: '₹129' },
  gems_m:        { name: '1,000 Gems',      desc: 'Unlock themes faster',                              price: '₹99'  },
  theme_cosmos:  { name: 'Cosmos Theme',    desc: 'Premium deep-space island',                         price: '₹99'  },
  lumen_pass:    { name: 'Lumen Pass (30d)',desc: 'Unlimited hints + 2x gems for 30 days',             price: '₹199' },
};

// Google's public TEST ad unit ids. Replace with yours for production.
export const AD_IDS = {
  android: { rewarded: 'ca-app-pub-3940256099942544/5224354917', interstitial: 'ca-app-pub-3940256099942544/1033173712' },
  ios:     { rewarded: 'ca-app-pub-3940256099942544/1712485313', interstitial: 'ca-app-pub-3940256099942544/4411468910' },
};
