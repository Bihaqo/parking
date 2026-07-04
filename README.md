# 🅿️ Parking Trainer

Top-down parking practice game, parktronic style. Static site — no build step.

**Play locally:** just open `index.html` in a browser.

**Publish on GitHub Pages:**
1. Push to GitHub: `git add index.html app.js README.md && git commit -m "Parking trainer" && git push`
2. On GitHub: **Settings → Pages → Source: Deploy from a branch → main / (root) → Save**
3. Site appears at `https://bihaqo.github.io/parking/` after a minute or two.

## Controls

- **W / S** (or ↑/↓) — drive forward / reverse; speed capped by the slider
- **A / D** (or ←/→) — steer (wheel stays where you leave it, like a real car)
- **Space** — straighten the wheels quickly
- **R** — restart the attempt

## Scenarios

Parallel, Bay (perpendicular), Angled (45°), and Garage — each in Roomy / Normal / Tight.
Park fully inside the green spot, roughly aligned, and stop for a second to finish.
You get a 1–3 star rating based on centering, alignment, and bumps.

Helpers (all toggleable): dashed trajectory guides predicting your path at the current
steering angle, parktronic proximity bars and beeps on both bumpers, and exact
front/rear clearance in meters on the dashboard.
