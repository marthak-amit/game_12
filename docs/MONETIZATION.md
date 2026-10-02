# Monetization & the ₹10 lakh / month goal

**Honest framing first:** no developer can guarantee ₹10 lakh/month. Most games earn ~₹0. What
*can* be controlled is (1) game quality / retention, (2) monetization design, (3) user acquisition
economics. This project is built so all three can be tuned with numbers in `www/js/config.js`.

## The math you need to hit
Mobile hyper-casual / casual in India: blended ad revenue is roughly **₹0.8–2.5 per DAU per day**
(low eCPMs in IN; far higher in US/EU/JP). IAP converts ~1–3% of players.

| Target | Needed DAU (IN-heavy, ARPDAU ≈ ₹1.5) | Needed DAU (mixed tier-1 traffic, ARPDAU ≈ ₹4) |
|---|---|---|
| ₹10 lakh / month (₹33k/day) | ~22,000 | ~8,500 |

To reach that you need installs: with D1 40% / D7 15% / D30 6% retention, ~**150–250k installs
over a few months**, plus ongoing UA. Organic alone rarely gets there; budget for creative testing
and paid UA only once D1 ≥ 35% and ad-ARPDAU > UA cost per install.

## Revenue streams built in
| Stream | Where | Notes |
|---|---|---|
| Rewarded video | Continue after death (1/run), Double shards, Daily x2, Free shards | Player-initiated -> highest eCPM, no churn. |
| Interstitial | After 3rd run, every 3 deaths, min 90 s gap, never mid-run, removed by "Remove Ads" | Tunable in `AD_IDS`. |
| IAP | Remove Ads, Starter Pack, Shard packs, Premium skins, Rift Pass (30-day sub-style) | Starter Pack should be shown after run 2-3. |
| Banner | Not used (hurts UX of a 3D game) | |

## Retention loops built in
* **Rhythm + procedural music** – every run sounds different, "one more run" feeling.
* **Near-miss / graze economy** – risk gives energy; skill is rewarded.
* **Daily reward (7-day streak)**, **daily missions**, **skins** (cosmetic goals).
* Stage progression (palette + tempo + speed shift every 16 rows).

## What to do next (priority order)
1. Ship to Google Play **internal testing**; watch D1/D7 retention for 500+ users (Firebase Analytics).
2. Replace test AdMob ids; add **mediation** (AppLovin MAX / Unity LevelPlay) – +30-60% ad revenue.
3. Add real IAP plugin (RevenueCat is the easiest) and server-side receipt validation.
4. Add leaderboards (Play Games Services) + share-score button for virality.
5. Localise (Hindi, Spanish, Portuguese, Indonesian) – cheap, large install lift.
6. Run small UA tests (₹20-30k) with 15 s video creatives showing the phase mechanic.
7. Add more content: new obstacle types, boss "rift" every 10 stages, seasonal skins, events.
8. Comply with Play policies: privacy policy, Data Safety form, GDPR/UMP consent message, COPPA flag.
