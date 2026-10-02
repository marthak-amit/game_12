# PULSE RIFT — 3D mobile rhythm-runner

An original game: you ride a glowing orb inside an octagonal tunnel. **Swipe / tap to shift gravity**
(the whole world rolls with you), **hold to PHASE** through walls, graze danger to recharge energy.
Obstacles spawn on the music's beat and every row you clear plays a melody note, so each run composes
its own track. Palette, tempo and speed change every stage.

* Engine: **Three.js** (bundled, no CDN) — free
* Audio: 100% procedural WebAudio (no asset files)
* Mobile packaging: **Capacitor** (Android + iOS) — free
* Ads: AdMob via `@capacitor-community/admob` (Google *test* ids until you add yours)
* IAP: abstraction in `www/js/iap.js` (wire RevenueCat / cordova-plugin-purchase)

## Play in browser
```bash
python3 -m http.server 8080 --directory www   # or: npm run dev
# open http://localhost:8080  — arrows/A-D move, W flip, Space = phase
```

## Build the Android app
```bash
npm install
npx cap add android
# add to android/app/src/main/AndroidManifest.xml inside <application>:
#   <meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" android:value="YOUR_ADMOB_APP_ID"/>
npx cap sync android
npx cap open android      # Android Studio -> Build > Generate Signed Bundle (AAB) for Play Store
```
A GitHub Action (`.github/workflows/android-debug.yml`) builds a debug APK automatically.
iOS: `npx cap add ios && npx cap open ios` (needs a Mac + Apple developer account).

## Going live checklist
1. Replace test ids in `www/js/config.js` (`AD_IDS`) and the manifest app id.
2. Hook `nativePurchase()` in `www/js/iap.js` to your IAP provider; set matching product ids in the stores.
3. Add app icon / splash (`npx @capacitor/assets generate`).
4. Add privacy policy + consent (UMP) before enabling personalised ads.
5. Add analytics (Firebase) to measure D1/D7 retention, then tune `config.js`.

See `docs/MONETIZATION.md` for the revenue plan and honest numbers.

## Code map
| File | Purpose |
|---|---|
| `www/js/game.js` | 3D world, spawning, collision, scoring, particles, camera |
| `www/js/audio.js` | Procedural music sequencer + SFX |
| `www/js/main.js` | UI screens, input, shop, missions, ad/IAP flows |
| `www/js/store.js` | Save data, daily reward, daily missions |
| `www/js/ads.js`, `iap.js` | Monetization adapters (demo on web, native in app) |
| `www/js/config.js` | **All tuning knobs**, skins, products, ad frequency |
