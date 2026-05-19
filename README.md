# Space Playtime

A playful 3D space exploration web experience built with Three.js — Sun, all 8 planets, 18 moons, dwarf planets, distant stars, and a Gargantua-style black hole. Designed to be fun and educational for kids.

## Features

- Fully interactive Three.js solar system with realistic planet textures
- 18 moons (Earth's Moon uses NASA photo; Charon uses the iconic New Horizons photo as a billboard; all others are procedurally generated cratered surfaces)
- Find flow with category picker (Sun, Planets, Moons, Dwarf planets, Stars, Black hole) → per-item tiles
- Interactive hotspots on each focused body (About / Wow facts / Numbers)
- Mission intro cards and space quizzes
- "Home" and "Find" buttons in the top bar

## Run locally

This is a plain static site (HTML + CSS + JS modules + image textures). No build step.

```bash
cd space-playtime
python3 -m http.server 8000
# open http://localhost:8000
```

## Image credits

- Planet/moon photo textures: solarsystemscope.com (CC BY 4.0)
- Charon photo: NASA / JHUAPL / SwRI (public domain, via Wikimedia Commons)
- All other moon surfaces: procedurally generated

## License

Code: MIT. Image textures retain their respective licenses (see above).
