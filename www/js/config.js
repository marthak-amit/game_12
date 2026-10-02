// Central tuning + content tables. Change numbers here to rebalance the game.
export const CFG = {
  lanes: 8,
  apothem: 6.5,        // distance from tunnel centre to a wall face
  blockThick: 3.0,     // radial thickness of obstacles
  playerR: 4.5,        // radial position of the orb
  baseSpeed: 26,       // units / second at stage 0
  speedPerStage: 2.6,
  baseBpm: 100,
  bpmPerStage: 5,
  rowsPerStage: 16,
  maxStage: 9,
  phaseDrain: 42,      // energy / s while phasing
  phaseRegen: 7,       // energy / s while not phasing
  grazeEnergy: 12,
  gateEvery: 9,        // every Nth row is a full "gate" that must be phased
  gateDepth: 9,
  spawnAhead: 260,
  reviveInvuln: 2.2,
};

export const SKINS = [
  { id: 'nova',   name: 'Nova',   color: 0x19e6ff, price: 0 },
  { id: 'ember',  name: 'Ember',  color: 0xff7a3d, price: 300 },
  { id: 'viper',  name: 'Viper',  color: 0x7dff4d, price: 600 },
  { id: 'orchid', name: 'Orchid', color: 0xff4dd8, price: 1000 },
  { id: 'aurum',  name: 'Aurum',  color: 0xffd24d, price: 2000 },
  { id: 'void',   name: 'Void',   color: 0xb18cff, price: 3500 },
  { id: 'prism',  name: 'Prism',  rainbow: true, iap: 'skin_prism', priceLabel: '₹99' },
  { id: 'solar',  name: 'Solar',  color: 0xfff1a8, iap: 'skin_solar', priceLabel: '₹149' },
];

// Stage palettes (hue 0-360). Tunnel re-colours itself as you go deeper.
export const STAGE_HUES = [190, 310, 45, 140, 265, 0, 200, 330, 90, 20];

export const IAP_PRODUCTS = {
  remove_ads:   { name: 'Remove Ads',      desc: 'No interstitials. Rewarded ads stay optional.', price: '₹199' },
  starter_pack: { name: 'Starter Pack',    desc: '5,000 shards + Prism skin + Remove Ads',        price: '₹149' },
  shards_s:     { name: '1,500 Shards',    desc: 'A handful of shards',                           price: '₹49'  },
  shards_m:     { name: '5,000 Shards',    desc: 'Best value for skins',                          price: '₹129' },
  shards_l:     { name: '14,000 Shards',   desc: 'Unlock everything faster',                      price: '₹299' },
  skin_prism:   { name: 'Prism Skin',      desc: 'Rainbow orb + trail',                           price: '₹99'  },
  skin_solar:   { name: 'Solar Skin',      desc: 'Blazing white-gold orb',                        price: '₹149' },
  rift_pass:    { name: 'Rift Pass (30d)', desc: '+50% shards, 1 free revive per run, exclusive trail', price: '₹149' },
};

// Google's public TEST ad unit ids. Replace with your own in production.
export const AD_IDS = {
  android: {
    rewarded:     'ca-app-pub-3940256099942544/5224354917',
    interstitial: 'ca-app-pub-3940256099942544/1033173712',
  },
  ios: {
    rewarded:     'ca-app-pub-3940256099942544/1712485313',
    interstitial: 'ca-app-pub-3940256099942544/4411468910',
  },
  interstitialEveryNDeaths: 3,
  firstInterstitialAfterRuns: 3,
  interstitialMinGapMs: 90000,
};

export const DAILY_REWARDS = [50, 75, 100, 150, 200, 300, 600];
