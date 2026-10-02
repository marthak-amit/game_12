# Mobile 3D games (free tech stack: Three.js + Capacitor)

| Game | Genre | Folder |
|---|---|---|
| **Pulse Rift** | Rhythm-synced gravity-shift runner | [`pulse-rift/`](pulse-rift) |
| **Lumina Isles** | Calm 3D light-bending puzzle (infinite procedural levels) | [`lumina-isles/`](lumina-isles) |

Each folder is a standalone Capacitor app (`www/` = game, `package.json`, `capacitor.config.json`).
Run in a browser: `python3 -m http.server 8080 --directory <game>/www`.
Android debug APKs for both are built by GitHub Actions on every push (see the run's *Artifacts*).
Monetization plan and honest revenue maths: [`docs/MONETIZATION.md`](docs/MONETIZATION.md).
