# LUMINA ISLES — 3D light-bending puzzle

Floating islands, glass mirrors, crystal prisms and coloured beams. Tap a device to rotate it and route
every beam into a ring target of the same colour. Fewer taps = more stars. Every level is generated
backwards from a solved board, so **all levels are solvable** (verified for levels 1-400) and the supply is infinite.

* Tap = rotate · drag = orbit camera · 💡 hint · ↺ reset
* Daily puzzle (same for everyone) with streak rewards, island themes, procedural ambient music
* Monetization: rewarded ads for hints / skip / double gems / free gems, interstitial every 3rd level
  (never before level 4, 75 s min gap), IAP (Remove Ads, hint packs, premium theme, 30-day pass)

Run: `python3 -m http.server 8081 --directory www`. Build the app: `npm install && npx cap add android && npx cap sync android`.
All tuning lives in `www/js/config.js`; the puzzle generator is `www/js/puzzle.js` (pure logic, runs in Node).
