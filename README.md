# 🚀 Space Playtime

A playful, interactive 3D space-exploration web experience built with Three.js — designed to make learning about the solar system fun for kids.

> **Live demo:** https://akwasijr.github.io/space-playtime/

![Space Playtime overview](https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/Solar_System_Family_Portrait_-_1990.jpg/1280px-Solar_System_Family_Portrait_-_1990.jpg)

## ✨ What's inside

A complete miniature solar system rendered in real-time, with:

- ☀️ The **Sun** with a glowing corona
- 🪐 All **8 planets** (Mercury → Neptune), each with real NASA-derived photo textures
- �� **18 moons** — Earth's Moon and Charon use real NASA photos; all others are procedurally generated cratered surfaces with per-moon character (icy moons, volcanic Io, orange Titan, etc.)
- ❄️ **Dwarf planets** including Pluto and Charon
- 🌌 A field of distant **labelled stars** (Sirius, Proxima, Betelgeuse…)
- 🕳️ A **Gargantua-style black hole** with photon ring and gravitational lensing

## 🎮 How to play

1. **Land on the mission intro** with four playful mission cards.
2. Pick a mission, or hit "Let's explore!" to free-fly the system.
3. Use the **Find** button (top-left) to jump to any body — first pick a category (Sun, Planets, Moons, Dwarf planets, Stars, Black hole) then pick the specific object.
4. The camera flies in and an **info panel** opens with:
   - A hero image of the body
   - Multiple intro paragraphs
   - A quick-stats strip
   - A glowing **"Explore!"** button
5. Press **Explore!** and three colourful pills appear around the planet:
   - 📘 **About** — full description
   - ✦ **Wow facts** — colourful animated fact cards
   - 📊 **Numbers** — vital stats as gradient tiles
6. Some bodies (Sun, Earth, Mars, Jupiter, Saturn…) have a built-in **quiz**.
7. The **Home** button (top-right) returns to the mission picker.

## 🎨 Design notes

- Built with vanilla **HTML + CSS + ES modules + Three.js** — no build step, no framework.
- Procedural moon surface generator (`makeMoonTexture`) renders deterministic cratered globes from a seed, with options for icy rims, polar caps, chasma streaks, and accent maria.
- Charon is rendered as a billboard sprite using the iconic New Horizons enhanced-colour photo so it always shows the right face from any viewing angle.
- The interactive hotspots use screen-space projection of each body's world position, repositioning every frame as you drag and zoom.
- All animation uses bouncy spring easing (`cubic-bezier(0.34, 1.56, 0.64, 1)`) for playful entrance feel.

## 🛠 Run locally

This is a plain static site. No dependencies, no build.

```bash
cd space-playtime
python3 -m http.server 8000
# open http://localhost:8000
```

## 📜 Image credits

- **Planet/moon photo textures:** [solarsystemscope.com](https://www.solarsystemscope.com/textures) (CC BY 4.0)
- **Charon photo:** NASA / Johns Hopkins APL / Southwest Research Institute (public domain, via Wikimedia Commons)
- **All other moon surfaces:** procedurally generated
- **Solar System Family Portrait** (README header): NASA / JPL (public domain)

## 📄 License

Code: **MIT**. Image textures retain their respective upstream licenses (see above).

---

Made with ❤️ for a curious 9-year-old.
