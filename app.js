import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

const canvas = document.getElementById("scene");
const captionEl = document.getElementById("caption");
const backBtn = document.getElementById("back");
const hoverLabel = document.getElementById("hover-label");
const hint = document.getElementById("hint");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000005);

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 5000);
camera.position.set(0, 110, 320);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 5;
controls.maxDistance = 2000;
controls.enableZoom = true;
controls.enablePan = true;
controls.zoomSpeed = 1.1;
controls.panSpeed = 0.9;
controls.screenSpacePanning = true;
// Touch: one finger rotates, two fingers zoom + pan
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
// Mouse: left rotates, scroll zooms, right or shift+left pans
controls.mouseButtons = {
  LEFT: THREE.MOUSE.ROTATE,
  MIDDLE: THREE.MOUSE.DOLLY,
  RIGHT: THREE.MOUSE.PAN,
};

// Hold Shift to pan with the left button too - pan + zoom are always available
window.addEventListener("keydown", (e) => {
  if (e.key === "Shift") controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
});
window.addEventListener("keyup", (e) => {
  if (e.key === "Shift") controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
});

// --- post-processing: gravitational lensing ---
const LensShader = {
  uniforms: {
    tDiffuse: { value: null },
    uBH: { value: new THREE.Vector2(0, 0) },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uHorizonPx: { value: 0 },
    uActive: { value: 0 },
  },
  vertexShader: /* glsl */ `
 varying vec2 vUv;
 void main() {
 vUv = uv;
 gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
 }
 `,
  fragmentShader: /* glsl */ `
 uniform sampler2D tDiffuse;
 uniform vec2 uBH;
 uniform vec2 uResolution;
 uniform float uHorizonPx;
 uniform float uActive;
 varying vec2 vUv;

 void main() {
 vec2 frag = vUv * uResolution;
 vec2 bhPx = (uBH * 0.5 + 0.5) * uResolution;
 vec2 d = frag - bhPx;
 float dist = length(d);

 if (uActive < 0.5 || uHorizonPx < 1.0) {
 gl_FragColor = texture2D(tDiffuse, vUv);
 return;
 }

 float horizon = uHorizonPx;
 float influence = horizon * 7.0;

 // Inside event horizon: pure black
 if (dist < horizon) {
 gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
 return;
 }

 // Lensing zone
 if (dist < influence) {
 float t = (dist - horizon) / (influence - horizon);
 // Stronger bend close to the horizon, falls off outward
 float bend = pow(1.0 - t, 2.6) * horizon * 3.5;
 vec2 dir = d / dist;
 vec2 newPx = frag + dir * bend;
 vec2 newUv = clamp(newPx / uResolution, 0.0, 1.0);

 // Slight chromatic split for refraction feel
 float chroma = bend * 0.02;
 vec3 col;
 col.r = texture2D(tDiffuse, clamp((newPx + dir * chroma) / uResolution, 0.0, 1.0)).r;
 col.g = texture2D(tDiffuse, newUv).g;
 col.b = texture2D(tDiffuse, clamp((newPx - dir * chroma) / uResolution, 0.0, 1.0)).b;

 // Einstein ring: bright halo just outside horizon
 float ringInner = horizon * 1.00;
 float ringPeak = horizon * 1.10;
 float ringOuter = horizon * 1.45;
 float ring = smoothstep(ringInner, ringPeak, dist) * (1.0 - smoothstep(ringPeak, ringOuter, dist));
 col += vec3(1.0, 0.78, 0.45) * ring * 1.4;

 gl_FragColor = vec4(col, 1.0);
 return;
 }

 gl_FragColor = texture2D(tDiffuse, vUv);
 }
 `,
};

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const lensPass = new ShaderPass(LensShader);
composer.addPass(lensPass);

function resize() {
  const w = window.innerWidth,
    h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  lensPass.uniforms.uResolution.value.set(w, h);
}
window.addEventListener("resize", resize);
resize();

// --- helpers ---
function makeGlowTexture(
  inner = "rgba(255,200,120,1)",
  mid = "rgba(255,160,60,0.35)",
) {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  g.addColorStop(0, inner);
  g.addColorStop(0.4, mid);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

// Round sprite for points (no square edges)
function makeRoundPointTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(255,255,255,0.85)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const roundPointTex = makeRoundPointTexture();

// --- background stars ---
(function makeStars() {
  const count = 3500;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = Math.random(),
      v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const r = 1500 + Math.random() * 800;
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
    const c = 0.6 + Math.random() * 0.4;
    colors[i * 3] = c;
    colors[i * 3 + 1] = c;
    colors[i * 3 + 2] = Math.min(1, c + Math.random() * 0.2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: 1.8,
    vertexColors: true,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.95,
    map: roundPointTex,
    alphaTest: 0.05,
    depthWrite: false,
  });
  scene.add(new THREE.Points(geo, mat));
})();

// --- Milky Way band: denser stars clustered along the galactic plane ---
(function makeMilkyWayBand() {
  // Tilt the galactic plane so it looks like a real band crossing the sky
  const tilt = new THREE.Matrix4().makeRotationFromEuler(
    new THREE.Euler(0.62, 0.4, -0.18),
  );

  // Dense bright stars near the band
  const count = 8000;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    // Bias latitude toward 0 (cluster near galactic equator)
    const lat = Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? 1 : -1) * 0.35;
    const r = 1800 + Math.random() * 400;
    v.set(
      r * Math.cos(lat) * Math.cos(theta),
      r * Math.sin(lat),
      r * Math.cos(lat) * Math.sin(theta),
    );
    v.applyMatrix4(tilt);
    positions[i * 3] = v.x;
    positions[i * 3 + 1] = v.y;
    positions[i * 3 + 2] = v.z;
    // Warm-tinted dust + bluer hot stars mix
    const warm = Math.random() < 0.55;
    const b = 0.55 + Math.random() * 0.45;
    if (warm) {
      colors[i * 3]     = Math.min(1, b + 0.18);
      colors[i * 3 + 1] = b * 0.92;
      colors[i * 3 + 2] = b * 0.78;
    } else {
      colors[i * 3]     = b * 0.85;
      colors[i * 3 + 1] = b * 0.92;
      colors[i * 3 + 2] = Math.min(1, b + 0.15);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: 1.6,
    vertexColors: true,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.85,
    map: roundPointTex,
    alphaTest: 0.05,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  scene.add(new THREE.Points(geo, mat));

  // Soft glowing dust haze: a few thousand very faint points across a thicker band
  const haze = 4500;
  const hp = new THREE.Float32BufferAttribute(haze * 3, 3);
  const hc = new THREE.Float32BufferAttribute(haze * 3, 3);
  for (let i = 0; i < haze; i++) {
    const theta = Math.random() * Math.PI * 2;
    const lat = (Math.random() - 0.5) * 0.5;
    const r = 1900 + Math.random() * 350;
    v.set(
      r * Math.cos(lat) * Math.cos(theta),
      r * Math.sin(lat),
      r * Math.cos(lat) * Math.sin(theta),
    );
    v.applyMatrix4(tilt);
    hp.setXYZ(i, v.x, v.y, v.z);
    const t = 0.18 + Math.random() * 0.22;
    hc.setXYZ(i, t * 1.05, t * 0.88, t * 0.7);
  }
  const hazeGeo = new THREE.BufferGeometry();
  hazeGeo.setAttribute("position", hp);
  hazeGeo.setAttribute("color", hc);
  const hazeMat = new THREE.PointsMaterial({
    size: 4.5,
    vertexColors: true,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.55,
    map: roundPointTex,
    alphaTest: 0.02,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  scene.add(new THREE.Points(hazeGeo, hazeMat));
})();

scene.add(new THREE.AmbientLight(0x556688, 0.45));

// --- Sun ---
const TEX_BASE = "./textures/";
const texLoader = new THREE.TextureLoader();
function loadTex(file, onReady) {
  const t = texLoader.load(TEX_BASE + file, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    if (onReady) onReady(tex);
  });
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const sun = new THREE.Mesh(
  new THREE.SphereGeometry(15, 64, 64),
  new THREE.MeshBasicMaterial({ color: 0xffffff, map: loadTex("sunmap.jpg") }),
);
sun.userData = {
  name: "Sun",
  caption: "The Sun. Just a star, but really close.",
  viewDist: 56,
  kind: "star",
};
scene.add(sun);

const sunGlow = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: makeGlowTexture("rgba(255,220,140,1)", "rgba(255,160,60,0.35)"),
    color: 0xffaa55,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  }),
);
sunGlow.scale.set(70, 70, 1);
sun.add(sunGlow);

const sunLight = new THREE.PointLight(0xffe0aa, 3.4, 0, 0);
sun.add(sunLight);

// Soft fill so the night side isn't pitch black, and outer planets get plenty of starlight
scene.add(new THREE.HemisphereLight(0x6688bb, 0x222233, 0.55));

// --- Planets, dwarfs, moons ---
const planetPivots = [];
const planets = [];

function makePlanet({
  name,
  dist,
  radius,
  color,
  caption,
  details,
  viewDist,
  orbitSpeed,
  rings,
  tilt = 0,
  dwarf,
  texture,
  bump,
}) {
  const pivot = new THREE.Object3D();
  pivot.rotation.y = Math.random() * Math.PI * 2;
  scene.add(pivot);

  const matOpts = {
    color: texture ? 0xffffff : color,
    roughness: dwarf ? 1 : 0.92,
    metalness: 0.0,
  };
  if (texture) matOpts.map = loadTex(texture);
  if (bump) {
    matOpts.bumpMap = loadTex(bump);
    matOpts.bumpScale = 0.05;
  }
  const mat = new THREE.MeshStandardMaterial(matOpts);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 48), mat);
  mesh.position.set(dist, 0, 0);
  mesh.userData = {
    name,
    caption,
    details,
    viewDist: viewDist || Math.max(radius * 4.5, 6),
    kind: dwarf ? "dwarf" : "planet",
  };
  pivot.add(mesh);

  if (rings && rings.length) {
    const ringsGroup = new THREE.Group();
    for (const r of rings) {
      const ringMesh = new THREE.Mesh(
        new THREE.RingGeometry(radius * r.inner, radius * r.outer, 160, 1),
        new THREE.MeshBasicMaterial({
          color: r.color,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: r.opacity,
          depthWrite: false,
        }),
      );
      ringsGroup.add(ringMesh);
    }
    ringsGroup.rotation.x = Math.PI / 2;
    mesh.add(ringsGroup);
  }

  if (tilt) mesh.rotation.z = tilt;

  planetPivots.push({ pivot, speed: orbitSpeed });
  planets.push(mesh);
  return mesh;
}

// Real ring systems (radii are multiples of planet radius)
const jupiterRings = [
  { inner: 1.4, outer: 1.71, color: 0x6b4838, opacity: 0.06 }, // halo
  { inner: 1.71, outer: 1.81, color: 0x8a5a40, opacity: 0.22 }, // main ring
  { inner: 1.81, outer: 2.55, color: 0x553c2c, opacity: 0.06 }, // gossamer
];
const saturnRings = [
  { inner: 1.11, outer: 1.24, color: 0x4a4030, opacity: 0.1 }, // D
  { inner: 1.24, outer: 1.53, color: 0xa89878, opacity: 0.45 }, // C
  { inner: 1.53, outer: 1.95, color: 0xe5d4ad, opacity: 0.95 }, // B (brightest)
  // Cassini Division gap (1.95 - 2.03)
  { inner: 2.03, outer: 2.27, color: 0xd6c597, opacity: 0.75 }, // A
];
const uranusRings = [
  { inner: 1.6, outer: 1.95, color: 0x2e2e34, opacity: 0.22 }, // inner narrow rings (grouped)
  { inner: 1.97, outer: 2.02, color: 0x707078, opacity: 0.65 }, // epsilon ring
];
const neptuneRings = [
  { inner: 1.68, outer: 1.74, color: 0x3a4a60, opacity: 0.45 }, // Galle
  { inner: 2.1, outer: 2.18, color: 0x4a5a78, opacity: 0.65 }, // Le Verrier
  { inner: 2.5, outer: 2.6, color: 0x506080, opacity: 0.8 }, // Adams (with arcs)
];

const mercury = makePlanet({
  name: "Mercury",
  dist: 24,
  radius: 0.7,
  color: 0xa9a9a9,
  caption: "Mercury. Tiny, baked, no atmosphere.",
  orbitSpeed: 0.32,
  texture: "mercurymap.jpg",
  bump: "mercurybump.jpg",
});
const venus = makePlanet({
  name: "Venus",
  dist: 38,
  radius: 2.0,
  color: 0xe0c280,
  caption: "Venus. Hottest planet, clouds of acid.",
  orbitSpeed: 0.22,
  texture: "venusmap.jpg",
});
const earth = makePlanet({
  name: "Earth",
  dist: 70,
  radius: 2.6,
  color: 0x2a6ec1,
  caption: "Earth. The only place we know with life.",
  orbitSpeed: 0.16,
  tilt: 0.41,
  texture: "earthmap1k.jpg",
  bump: "earthbump1k.jpg",
});
const mars = makePlanet({
  name: "Mars",
  dist: 95,
  radius: 1.1,
  color: 0xc1573b,
  caption: "Mars. The rusty red one.",
  orbitSpeed: 0.13,
  tilt: 0.44,
  texture: "marsmap1k.jpg",
  bump: "marsbump1k.jpg",
});
const jupiter = makePlanet({
  name: "Jupiter",
  dist: 175,
  radius: 12,
  color: 0xd1a472,
  caption: "Jupiter. Bigger than every other planet combined.",
  orbitSpeed: 0.07,
  tilt: 0.054,
  rings: jupiterRings,
  texture: "jupitermap.jpg",
});
const saturn = makePlanet({
  name: "Saturn",
  dist: 245,
  radius: 10,
  color: 0xe5c89d,
  caption: "Saturn. The rings are mostly chunks of ice.",
  orbitSpeed: 0.05,
  tilt: 0.467,
  rings: saturnRings,
  texture: "saturnmap.jpg",
});
const uranus = makePlanet({
  name: "Uranus",
  dist: 320,
  radius: 5,
  color: 0x9ed7e0,
  caption: "Uranus. Tipped on its side. Methane makes it blue.",
  orbitSpeed: 0.035,
  tilt: 1.706,
  rings: uranusRings,
  texture: "uranusmap.jpg",
});
const neptune = makePlanet({
  name: "Neptune",
  dist: 400,
  radius: 4.9,
  color: 0x4a7ddc,
  caption: "Neptune. Wind storms hit 2,000 km/h.",
  orbitSpeed: 0.025,
  tilt: 0.494,
  rings: neptuneRings,
  texture: "neptunemap.jpg",
});

// Dwarf planets
const ceres = makePlanet({
  name: "Ceres",
  dist: 128,
  radius: 0.45,
  color: 0x9c8a6e,
  caption: "Ceres. A dwarf planet hiding in the asteroid belt.",
  orbitSpeed: 0.1,
  dwarf: true,
});
const pluto = makePlanet({
  name: "Pluto",
  dist: 510,
  radius: 0.85,
  color: 0xc7a890,
  caption: "Pluto. Used to be a planet, now a dwarf planet.",
  orbitSpeed: 0.018,
  dwarf: true,
  texture: "plutomap1k.jpg",
});
const haumea = makePlanet({
  name: "Haumea",
  dist: 480,
  radius: 0.55,
  color: 0xd9d4c5,
  caption: "Haumea. An egg-shaped dwarf planet.",
  orbitSpeed: 0.02,
  dwarf: true,
});
const makemake = makePlanet({
  name: "Makemake",
  dist: 540,
  radius: 0.6,
  color: 0xd6a07a,
  caption: "Makemake. A frozen dwarf planet way out there.",
  orbitSpeed: 0.016,
  dwarf: true,
});
const eris = makePlanet({
  name: "Eris",
  dist: 600,
  radius: 0.85,
  color: 0xdedede,
  caption: "Eris. The dwarf planet that got Pluto demoted.",
  orbitSpeed: 0.012,
  dwarf: true,
});

// --- Moons (orbit their parent planet) ---
const moons = [];

// Procedural cratered surface texture for moons that don't have a real photo map.
// Returns a CanvasTexture (1024x512 equirectangular).
function makeMoonTexture(baseHex, opts = {}) {
  const {
    craters = 90,
    maria = 70,
    seed = 1,
    accent = null, // optional second tint for variation
    icy = false,   // brighter rim + bluish darks
    polarCap = null, // { color: "#7a4a36", strength: 0.9, size: 0.35, hemi: "north" }
    chasma = 0,    // number of canyon lines
    chasmaColor = "rgba(0,0,0,0.35)",
  } = opts;
  // tiny seeded RNG for reproducibility
  let s = seed * 9301 + 49297;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };

  const w = 1024, h = 512;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");

  // base color
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, w, h);

  // Polar cap (e.g., Charon's reddish-brown "Mordor Macula")
  if (polarCap) {
    const capColor = polarCap.color || "#7a4a36";
    const capStrength = polarCap.strength != null ? polarCap.strength : 0.85;
    const capSize = polarCap.size != null ? polarCap.size : 0.32;
    const hemi = polarCap.hemi || "north";
    // capSize is fraction of latitude span. north cap: y in [0, h*capSize]
    const yEdge = hemi === "north" ? h * capSize : h * (1 - capSize);
    // Build a vertical gradient that feathers the cap edge
    const grd = ctx.createLinearGradient(
      0, hemi === "north" ? 0 : h,
      0, yEdge,
    );
    grd.addColorStop(0, hexA(capColor, capStrength));
    grd.addColorStop(0.7, hexA(capColor, capStrength * 0.55));
    grd.addColorStop(1, hexA(capColor, 0));
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
    // Add ragged feathered edge — random soft blobs along the cap boundary
    for (let i = 0; i < 60; i++) {
      const x = rand() * w;
      const yBase = yEdge + (rand() - 0.5) * h * 0.18;
      const r = 30 + rand() * 90;
      const g2 = ctx.createRadialGradient(x, yBase, 0, x, yBase, r);
      const inner = rand() < 0.55 ? hexA(capColor, capStrength * 0.5) : "rgba(255,255,255,0)";
      g2.addColorStop(0, inner);
      g2.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(x, yBase, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // wide soft regional variations (maria / highlands)
  for (let i = 0; i < maria; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = 60 + rand() * 220;
    const dark = rand() < 0.55;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    if (dark) {
      g.addColorStop(0, icy ? "rgba(40,55,80,0.22)" : "rgba(0,0,0,0.22)");
    } else if (accent) {
      g.addColorStop(0, accent + "55");
    } else {
      g.addColorStop(0, "rgba(255,255,255,0.08)");
    }
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // craters: shadowed bowl + bright rim. Bias toward smaller craters.
  for (let i = 0; i < craters; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const rr = rand();
    const r = 2 + Math.pow(rr, 3.2) * 50;

    // soft outer shadow (south-east lighting feel)
    const sh = ctx.createRadialGradient(
      x + r * 0.25, y + r * 0.25, 0,
      x, y, r * 1.05,
    );
    sh.addColorStop(0, "rgba(0,0,0,0.55)");
    sh.addColorStop(0.6, "rgba(0,0,0,0.28)");
    sh.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.05, 0, Math.PI * 2);
    ctx.fill();

    // bright rim
    ctx.strokeStyle = icy
      ? "rgba(220,235,255,0.45)"
      : "rgba(255,245,225,0.4)";
    ctx.lineWidth = Math.max(0.5, r * 0.07);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.92, 0, Math.PI * 2);
    ctx.stroke();

    // small bright central peak for some bigger craters
    if (r > 18 && rand() < 0.4) {
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.beginPath();
      ctx.arc(x - r * 0.15, y - r * 0.15, r * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Chasma / canyon lines (faint dark streaks across the equator region)
  for (let i = 0; i < chasma; i++) {
    const y = h * (0.35 + rand() * 0.35);
    const x0 = rand() * w;
    const len = w * (0.18 + rand() * 0.28);
    const segs = 14;
    ctx.strokeStyle = chasmaColor;
    ctx.lineWidth = 1.2 + rand() * 1.8;
    ctx.lineCap = "round";
    ctx.beginPath();
    let px = x0, py = y;
    ctx.moveTo(px, py);
    for (let k = 1; k <= segs; k++) {
      px += (len / segs);
      py += (rand() - 0.5) * 6;
      ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// hex "#rrggbb" + alpha 0..1 -> "rgba(r,g,b,a)"
function hexA(hex, a) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// Cache per (color, opts) so identical-config moons don't regenerate
const _moonTexCache = new Map();
function getProcMoonTex(baseHex, opts = {}) {
  const key = baseHex + "|" + JSON.stringify(opts);
  if (_moonTexCache.has(key)) return _moonTexCache.get(key);
  const t = makeMoonTexture(baseHex, opts);
  _moonTexCache.set(key, t);
  return t;
}

function addMoon(
  parent,
  { name, dist, radius, color, speed, caption, texture, bump, hiRes, procOpts, billboard },
) {
  const pivot = new THREE.Object3D();
  pivot.rotation.y = Math.random() * Math.PI * 2;
  pivot.rotation.x = (Math.random() - 0.5) * 0.25;
  parent.add(pivot);

  let m;
  if (billboard) {
    // Camera-facing sprite using a real photo with circular alpha
    const tex = loadTex(billboard);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sm = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: true,
      alphaTest: 0.15,
    });
    m = new THREE.Sprite(sm);
    // Sprite is 1x1 by default; scale to diameter
    m.scale.set(radius * 2, radius * 2, 1);
    m.position.set(dist, 0, 0);
  } else {
    const matOpts = {
      color: 0xffffff,
      roughness: 1,
      metalness: 0,
    };
    if (texture) {
      matOpts.map = loadTex(texture);
    } else {
      // Build a procedural surface based on the moon's tint color
      const hex = "#" + new THREE.Color(color).getHexString();
      const seed = Math.abs(
        [...name].reduce((a, ch) => a + ch.charCodeAt(0), 0),
      );
      const procTex = getProcMoonTex(hex, { seed, ...(procOpts || {}) });
      matOpts.map = procTex;
      matOpts.bumpMap = procTex;
      matOpts.bumpScale = 0.05;
    }
    if (bump) {
      matOpts.bumpMap = loadTex(bump);
      matOpts.bumpScale = hiRes ? 0.08 : 0.02;
    }

    const segs = hiRes ? 96 : 48;
    m = new THREE.Mesh(
      new THREE.SphereGeometry(radius, segs, segs),
      new THREE.MeshStandardMaterial(matOpts),
    );
    m.position.set(dist, 0, 0);
    if (hiRes) m.rotation.z = 0.1;
  }
  m.userData = {
    name,
    caption,
    viewDist: Math.max(radius * 6, 2.5),
    kind: "moon",
    parent,
  };
  pivot.add(m);
  moons.push({ pivot, mesh: m, speed });
  return m;
}

// Earth's Moon (the original, kept here for grouping)
const moon = addMoon(earth, {
  name: "Moon",
  dist: 5.5,
  radius: 0.75,
  color: 0xcccccc,
  speed: 0.6,
  caption: "The Moon. About four Earth-widths away.",
  texture: "moon_2k.jpg",
  bump: "moon_2k.jpg",
  hiRes: true,
});

// Mars - two tiny rocks
addMoon(mars, {
  name: "Phobos",
  dist: 2.6,
  radius: 0.1,
  color: 0x7a6a5a,
  speed: 1.4,
  caption: "Phobos. A potato-shaped moon spiraling toward Mars.",
});
addMoon(mars, {
  name: "Deimos",
  dist: 3.6,
  radius: 0.07,
  color: 0x8b7868,
  speed: 0.7,
  caption: "Deimos. Mars\u2019 tiny outer moon.",
});

// Jupiter - the four Galilean moons
addMoon(jupiter, {
  name: "Io",
  dist: 9.0,
  radius: 0.55,
  color: 0xeed070,
  speed: 1.1,
  caption: "Io. The most volcanic place in the solar system.",
  procOpts: { craters: 30, maria: 110, accent: "#cc4422" },
});
addMoon(jupiter, {
  name: "Europa",
  dist: 11.5,
  radius: 0.5,
  color: 0xd9c9a6,
  speed: 0.85,
  caption: "Europa. Icy crust hiding a salty ocean.",
  procOpts: { craters: 15, maria: 60, icy: true, accent: "#7c5a3a" },
});
addMoon(jupiter, {
  name: "Ganymede",
  dist: 14.0,
  radius: 0.78,
  color: 0x9c8b75,
  speed: 0.65,
  caption: "Ganymede. The biggest moon in the solar system.",
  procOpts: { craters: 110, maria: 80 },
});
addMoon(jupiter, {
  name: "Callisto",
  dist: 17.5,
  radius: 0.72,
  color: 0x6a5d52,
  speed: 0.45,
  caption: "Callisto. The most cratered world we know.",
  procOpts: { craters: 200, maria: 50 },
});

// Saturn - Titan, Enceladus, Mimas, Rhea
addMoon(saturn, {
  name: "Mimas",
  dist: 7.5,
  radius: 0.18,
  color: 0xd4d0c8,
  speed: 1.3,
  caption: "Mimas. The Death-Star moon (with a giant crater).",
  procOpts: { craters: 140, maria: 40, icy: true },
});
addMoon(saturn, {
  name: "Enceladus",
  dist: 8.5,
  radius: 0.22,
  color: 0xf2f4f5,
  speed: 1.05,
  caption: "Enceladus. Shoots water geysers from its south pole.",
  procOpts: { craters: 25, maria: 90, icy: true },
});
addMoon(saturn, {
  name: "Rhea",
  dist: 10.0,
  radius: 0.45,
  color: 0xc8c2b6,
  speed: 0.75,
  caption: "Rhea. Saturn\u2019s second-largest moon, made of ice.",
  procOpts: { craters: 120, maria: 60, icy: true },
});
addMoon(saturn, {
  name: "Titan",
  dist: 13.0,
  radius: 0.85,
  color: 0xe6a85a,
  speed: 0.55,
  caption: "Titan. Has a thick atmosphere and lakes of liquid methane.",
  procOpts: { craters: 10, maria: 120, accent: "#a06820" },
});

// Uranus - Miranda, Ariel, Titania, Oberon
addMoon(uranus, {
  name: "Miranda",
  dist: 5.0,
  radius: 0.18,
  color: 0xb8b8b8,
  speed: 1.1,
  caption: "Miranda. A patchwork moon with giant cliffs.",
  procOpts: { craters: 60, maria: 100, icy: true },
});
addMoon(uranus, {
  name: "Ariel",
  dist: 6.2,
  radius: 0.32,
  color: 0xc8c4bc,
  speed: 0.85,
  caption: "Ariel. The brightest of Uranus\u2019 moons.",
  procOpts: { craters: 70, maria: 60, icy: true },
});
addMoon(uranus, {
  name: "Titania",
  dist: 8.0,
  radius: 0.42,
  color: 0xa89e8e,
  speed: 0.55,
  caption: "Titania. Uranus\u2019 largest moon, named after Shakespeare.",
  procOpts: { craters: 100, maria: 70 },
});
addMoon(uranus, {
  name: "Oberon",
  dist: 9.6,
  radius: 0.4,
  color: 0x988b7a,
  speed: 0.42,
  caption: "Oberon. An icy world with reddish craters.",
  procOpts: { craters: 130, maria: 50, accent: "#7a3a2a" },
});

// Neptune - Triton (orbits backwards)
addMoon(neptune, {
  name: "Triton",
  dist: 7.5,
  radius: 0.55,
  color: 0xd0c9bd,
  speed: -0.65,
  caption: "Triton. Orbits backwards, probably a captured Kuiper-belt object.",
  procOpts: { craters: 25, maria: 90, icy: true, accent: "#b08858" },
});
addMoon(neptune, {
  name: "Nereid",
  dist: 10.5,
  radius: 0.18,
  color: 0xb6b0a4,
  speed: 0.3,
  caption: "Nereid. A small moon on a wildly stretched orbit.",
  procOpts: { craters: 80, maria: 40 },
});

// Pluto - Charon (about half Pluto's size)
addMoon(pluto, {
  name: "Charon",
  dist: 2.8,
  radius: 0.42,
  color: 0xb8b3ad,
  speed: 0.7,
  caption: "Charon. So big it and Pluto orbit a point in space between them.",
  billboard: "charon_billboard.png",
});

// --- Belts ---
function makeBelt({ innerR, outerR, count, thickness, color, size }) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = innerR + Math.random() * (outerR - innerR);
    const theta = Math.random() * Math.PI * 2;
    const y = (Math.random() - 0.5) * thickness;
    positions[i * 3] = r * Math.cos(theta);
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = r * Math.sin(theta);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color,
    size,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.85,
    map: roundPointTex,
    alphaTest: 0.05,
    depthWrite: false,
  });
  return new THREE.Points(geo, mat);
}

const asteroidBelt = makeBelt({
  innerR: 110,
  outerR: 150,
  count: 2400,
  thickness: 4,
  color: 0x9c8a6e,
  size: 0.55,
});
asteroidBelt.visible = false;
// Asteroid-belt debris hidden, it looked like noisy junk floating across the scene

const kuiperBelt = makeBelt({
  innerR: 460,
  outerR: 620,
  count: 3500,
  thickness: 14,
  color: 0x8090b0,
  size: 0.7,
});
scene.add(kuiperBelt);

// --- Earth low-orbit scene: satellites + rocket launch (visible only up close) ---
const earthOrbital = new THREE.Group();
earth.add(earthOrbital);
earthOrbital.visible = false;

// Materials reused across satellites
const satBodyMat = new THREE.MeshStandardMaterial({
  color: 0xdddddd,
  roughness: 0.5,
  metalness: 0.7,
});
const satPanelMat = new THREE.MeshStandardMaterial({
  color: 0x223a78,
  roughness: 0.4,
  metalness: 0.2,
  emissive: 0x0a1840,
  emissiveIntensity: 0.35,
});
const satAntennaMat = new THREE.MeshStandardMaterial({
  color: 0x999999,
  roughness: 0.7,
});

function makeSatellite() {
  const g = new THREE.Group();
  // central bus
  const bus = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.14), satBodyMat);
  g.add(bus);
  // two solar panels
  const panelGeo = new THREE.BoxGeometry(0.32, 0.005, 0.1);
  const pL = new THREE.Mesh(panelGeo, satPanelMat);
  pL.position.x = -0.22;
  g.add(pL);
  const pR = new THREE.Mesh(panelGeo, satPanelMat);
  pR.position.x = 0.22;
  g.add(pR);
  // small antenna
  const ant = new THREE.Mesh(
    new THREE.CylinderGeometry(0.005, 0.005, 0.12, 6),
    satAntennaMat,
  );
  ant.rotation.z = Math.PI / 2;
  ant.position.set(0.1, 0, 0);
  g.add(ant);
  // tiny status light
  const led = new THREE.Mesh(
    new THREE.SphereGeometry(0.012, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff5544 }),
  );
  led.position.set(0, 0.06, 0);
  g.add(led);
  return g;
}

const satellites = [];
let issSatRef = null;
const satConfigs = [
  { name: "ISS", alt: 2.85, incl: 0.91, speed: 0.65, phase: 0.0 },
  { name: "Hubble", alt: 2.9, incl: 0.5, speed: 0.55, phase: 1.4 },
  { name: "GPS", alt: 3.3, incl: 0.96, speed: 0.32, phase: 2.6 },
  { name: "Geostat-1", alt: 3.95, incl: 0.05, speed: 0.18, phase: 3.7 },
  { name: "Polar Sat", alt: 2.95, incl: 1.55, speed: 0.5, phase: 5.0 },
  { name: "Comms Sat", alt: 3.1, incl: 0.3, speed: 0.42, phase: 0.7 },
];
for (const cfg of satConfigs) {
  const pivot = new THREE.Object3D();
  pivot.rotation.x = cfg.incl;
  pivot.rotation.y = cfg.phase;
  earthOrbital.add(pivot);
  const sat = makeSatellite();
  sat.position.set(cfg.alt, 0, 0);
  pivot.add(sat);
  const entry = { pivot, sat, speed: cfg.speed, name: cfg.name };
  satellites.push(entry);
  if (cfg.name === "ISS") issSatRef = entry;
}

// --- Rocket launch ---
let activeRocket = null;
const rocketBodyMat = new THREE.MeshStandardMaterial({
  color: 0xf2f2f2,
  roughness: 0.45,
  metalness: 0.15,
});
const rocketStripeMat = new THREE.MeshStandardMaterial({
  color: 0xc12828,
  roughness: 0.6,
});
const rocketTipMat = new THREE.MeshStandardMaterial({
  color: 0xc12828,
  roughness: 0.5,
});
const rocketWindowMat = new THREE.MeshBasicMaterial({ color: 0x88ccff });
const flameCoreMat = new THREE.MeshBasicMaterial({
  color: 0xffe6a0,
  transparent: true,
  opacity: 0.95,
});
const flameOuterMat = new THREE.MeshBasicMaterial({
  color: 0xff7733,
  transparent: true,
  opacity: 0.65,
});

function makeRocket() {
  const g = new THREE.Group();
  // body
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 0.42, 16),
    rocketBodyMat,
  );
  g.add(body);
  // red stripe
  const stripe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.061, 0.061, 0.06, 16),
    rocketStripeMat,
  );
  stripe.position.y = -0.1;
  g.add(stripe);
  // nose cone
  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.06, 0.14, 16),
    rocketTipMat,
  );
  tip.position.y = 0.28;
  g.add(tip);
  // window
  const win = new THREE.Mesh(
    new THREE.SphereGeometry(0.022, 12, 12),
    rocketWindowMat,
  );
  win.position.y = 0.16;
  win.position.z = 0.058;
  g.add(win);
  // three fins
  const finGeo = new THREE.BoxGeometry(0.005, 0.1, 0.1);
  for (let i = 0; i < 3; i++) {
    const fin = new THREE.Mesh(finGeo, rocketStripeMat);
    fin.position.y = -0.18;
    const a = (i / 3) * Math.PI * 2;
    fin.position.x = Math.cos(a) * 0.07;
    fin.position.z = Math.sin(a) * 0.07;
    fin.rotation.y = -a;
    g.add(fin);
  }
  // exhaust flames (two stacked cones)
  const flameOuter = new THREE.Mesh(
    new THREE.ConeGeometry(0.07, 0.3, 12),
    flameOuterMat,
  );
  flameOuter.position.y = -0.36;
  flameOuter.rotation.x = Math.PI;
  g.add(flameOuter);
  const flameCore = new THREE.Mesh(
    new THREE.ConeGeometry(0.04, 0.2, 12),
    flameCoreMat,
  );
  flameCore.position.y = -0.32;
  flameCore.rotation.x = Math.PI;
  g.add(flameCore);

  g.userData.flameCore = flameCore;
  g.userData.flameOuter = flameOuter;
  return g;
}

// Smoke trail using a dynamic line
function makeSmokeTrail() {
  const MAX = 80;
  const positions = new Float32Array(MAX * 3);
  const colors = new Float32Array(MAX * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setDrawRange(0, 0);
  const mat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
  });
  const line = new THREE.Line(geo, mat);
  line.frustumCulled = false;
  return { line, positions, colors, count: 0, MAX };
}

function launchRocket() {
  if (activeRocket) {
    earthOrbital.remove(activeRocket.group);
    earthOrbital.remove(activeRocket.trail.line);
  }
  const group = new THREE.Group();
  // Place at Earth's surface, near equator + small offset so user sees it
  const startLat = 0.15; // slight latitude
  const startLon = Math.random() * Math.PI * 2;
  const surfaceR = 1.005; // just above surface (planet radius=1 in earth-local units? no, radius=2.6)
  // earth radius in earth's local space is its own 2.6 - but earthOrbital is added to earth,
  // and earth uses its own scale=1. So local radius is 2.6.
  const R = 2.6;
  const x = R * Math.cos(startLat) * Math.cos(startLon);
  const y = R * Math.sin(startLat);
  const z = R * Math.cos(startLat) * Math.sin(startLon);
  group.position.set(x, y, z);
  // Orient rocket so its +Y axis points outward (away from earth center)
  const up = new THREE.Vector3(x, y, z).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    up,
  );
  group.quaternion.copy(q);

  const rocket = makeRocket();
  group.add(rocket);
  earthOrbital.add(group);

  const trail = makeSmokeTrail();
  earthOrbital.add(trail.line);

  activeRocket = {
    group,
    rocket,
    trail,
    up,
    t: 0,
    dur: 7.0,
    startPos: new THREE.Vector3(x, y, z),
    speed: 0, // will accelerate
  };
}

function updateRocket(dt) {
  if (!activeRocket) return;
  const r = activeRocket;
  r.t += dt;

  // Accelerate (rocket equation-ish): start slow, ramp up.
  r.speed += dt * 0.55;
  // Move outward along the up vector
  r.group.position.addScaledVector(r.up, r.speed * dt);

  // Flicker flames
  const flicker = 0.85 + Math.random() * 0.3;
  r.rocket.userData.flameCore.scale.set(
    flicker,
    0.7 + Math.random() * 0.6,
    flicker,
  );
  r.rocket.userData.flameOuter.scale.set(
    flicker * 1.1,
    0.8 + Math.random() * 0.7,
    flicker * 1.1,
  );

  // Append to smoke trail every frame, capped
  const tr = r.trail;
  if (tr.count < tr.MAX) {
    const i = tr.count;
    tr.positions[i * 3] = r.group.position.x;
    tr.positions[i * 3 + 1] = r.group.position.y;
    tr.positions[i * 3 + 2] = r.group.position.z;
    // Fade trail color from orange→white→transparent
    const age = i / tr.MAX;
    tr.colors[i * 3] = 1.0;
    tr.colors[i * 3 + 1] = 0.7 - age * 0.4;
    tr.colors[i * 3 + 2] = 0.4 - age * 0.4;
    tr.count++;
    tr.line.geometry.attributes.position.needsUpdate = true;
    tr.line.geometry.attributes.color.needsUpdate = true;
    tr.line.geometry.setDrawRange(0, tr.count);
  }

  // After dur, fade out and clean up
  if (r.t > r.dur) {
    earthOrbital.remove(r.group);
    earthOrbital.remove(r.trail.line);
    r.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    r.trail.line.geometry.dispose();
    activeRocket = null;
  }
}

const launchBtn = document.getElementById("launch-btn");
launchBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  launchRocket();
});

// --- Distant named stars ---
const namedStars = [];
const starData = [
  {
    name: "Sirius",
    pos: [-380, 90, -260],
    color: 0xaad4ff,
    caption: "Sirius. The brightest star in our night sky.",
  },
  {
    name: "Betelgeuse",
    pos: [320, -50, -240],
    color: 0xff7755,
    caption: "Betelgeuse. A red giant, about to explode (in star time).",
  },
  {
    name: "Rigel",
    pos: [240, 140, 340],
    color: 0xc8d8ff,
    caption: "Rigel. A blue supergiant. Incredibly hot.",
  },
];
for (const s of starData) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(4, 16, 16),
    new THREE.MeshBasicMaterial({ color: s.color }),
  );
  m.position.set(...s.pos);
  m.userData = {
    name: s.name,
    caption: s.caption,
    viewDist: 16,
    kind: "farstar",
  };
  scene.add(m);

  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture("rgba(255,255,255,1)", "rgba(180,200,255,0.3)"),
      color: s.color,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }),
  );
  halo.scale.set(22, 22, 1);
  m.add(halo);
  namedStars.push(m);
}

// --- Black hole (Gargantua-style) ---
const blackHoleGroup = new THREE.Object3D();
blackHoleGroup.position.set(-1100, 150, -800);
scene.add(blackHoleGroup);

const eventHorizonRadius = 6;
const blackHole = new THREE.Mesh(
  new THREE.SphereGeometry(eventHorizonRadius, 32, 32),
  new THREE.MeshBasicMaterial({ color: 0x000000 }),
);
blackHole.userData = {
  name: "Black hole",
  caption: "A black hole. Even light can\u2019t escape it.",
  viewDist: 32,
  isBlackHole: true,
  kind: "blackhole",
};
blackHoleGroup.add(blackHole);

// Accretion disc - thin, hot inner edge fading outward, with Doppler asymmetry
const discInner = eventHorizonRadius * 1.5;
const discOuter = eventHorizonRadius * 5.5;
const discGeo = new THREE.RingGeometry(discInner, discOuter, 192, 4);
const discPos = discGeo.attributes.position;
const discColors = new Float32Array(discPos.count * 3);
for (let i = 0; i < discPos.count; i++) {
  const x = discPos.getX(i),
    y = discPos.getY(i);
  const r = Math.sqrt(x * x + y * y);
  const t = (r - discInner) / (discOuter - discInner); // 0 inner, 1 outer

  // Color: white-hot inner -> yellow -> deep orange outer
  const hue = 0.13 - t * 0.1; // yellow -> red
  const sat = 0.6 + t * 0.4;
  const light = 0.95 - t * 0.65; // very bright inner, dim outer
  const c = new THREE.Color().setHSL(hue, sat, light);

  // Doppler-style brightness asymmetry: one side brighter than the other
  const angle = Math.atan2(y, x);
  const doppler = 0.55 + 0.45 * Math.cos(angle); // 0.1 .. 1.0
  c.multiplyScalar(0.5 + doppler);

  discColors[i * 3] = c.r;
  discColors[i * 3 + 1] = c.g;
  discColors[i * 3 + 2] = c.b;
}
discGeo.setAttribute("color", new THREE.BufferAttribute(discColors, 3));
const disc = new THREE.Mesh(
  discGeo,
  new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 1.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
);
// Lay disc flat in XZ plane (Saturn-style) - lensing shader will bend the back half up
disc.rotation.x = Math.PI / 2;
disc.rotation.z = 0.15;
blackHoleGroup.add(disc);

// Photon ring - thin bright ring hugging the horizon
const photonGeo = new THREE.RingGeometry(
  eventHorizonRadius * 1.06,
  eventHorizonRadius * 1.18,
  128,
  1,
);
const photonRing = new THREE.Mesh(
  photonGeo,
  new THREE.MeshBasicMaterial({
    color: 0xffd9a0,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
);
photonRing.rotation.x = Math.PI / 2;
photonRing.rotation.z = 0.15;
blackHoleGroup.add(photonRing);

// --- Relativistic jet (points toward viewer) ---
// Two cones tip-to-tail along the same axis. Each frame we orient the axis
// to point from the black hole toward the camera, so the bright jet is
// always shooting "out at you" while the dim counter-jet recedes behind.
const jetLength = 140;
const jetBaseRadius = 2.2;
const jetGroup = new THREE.Object3D();
blackHoleGroup.add(jetGroup);

function makeJetCone(length, baseRadius, tipColor, baseColor, opacity) {
  const segs = 48;
  const geo = new THREE.ConeGeometry(baseRadius, length, segs, 24, true);
  // Cone default: tip at +Y (length/2), base at -Y. We want base at origin, tip at +Y.
  geo.translate(0, length / 2, 0);
  // Vertex colors: bright/white at tip, fading to baseColor at the base
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cTip = new THREE.Color(tipColor);
  const cBase = new THREE.Color(baseColor);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = Math.min(1, Math.max(0, y / length)); // 0 at base, 1 at tip
    // Brightness peaks ~80% along jet, dims at very tip and at base
    const knot = 1 - Math.abs(t - 0.78) * 1.6;
    const k = Math.max(0.15, knot);
    const c = cBase.clone().lerp(cTip, t).multiplyScalar(k);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
}

const jetForward = makeJetCone(
  jetLength,
  jetBaseRadius,
  0xffffff,
  0x4488ff,
  0.85,
);
const jetBack = makeJetCone(
  jetLength * 0.7,
  jetBaseRadius * 0.85,
  0xbfd6ff,
  0x2244aa,
  0.35,
);
jetBack.rotation.x = Math.PI; // flip 180° so it shoots the opposite way
jetGroup.add(jetForward);
jetGroup.add(jetBack);

// Soft glow at the base of the jet where it leaves the disc
const jetBase = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: makeGlowTexture("rgba(220,235,255,0.95)", "rgba(80,140,255,0.0)"),
    color: 0xcfe2ff,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    opacity: 0.85,
  }),
);
jetBase.scale.set(14, 14, 1);
jetGroup.add(jetBase);

// Faint outer halo
const bhHalo = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: makeGlowTexture("rgba(255,180,100,0.7)", "rgba(255,120,50,0.2)"),
    color: 0xff9955,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    opacity: 0.5,
  }),
);
bhHalo.scale.set(60, 60, 1);
blackHoleGroup.add(bhHalo);

const clickables = [
  sun,
  ...planets,
  ...moons.map((m) => m.mesh),
  ...namedStars,
  blackHole,
];

// --- Detailed info for each object ---
function buildDetails(opts) {
  const { tagline, image, credit, intro, facts, stats } = opts;
  let html = "";
  if (tagline) html += `<div class="info-tagline">${tagline}</div>`;
  if (image) {
    html += `<img class="info-img" src="${image}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling&&(this.nextElementSibling.style.display='none')" />`;
    if (credit) html += `<div class="info-credit">${credit}</div>`;
  }
  for (const para of intro || []) html += `<p>${para}</p>`;
  if (facts && facts.length) {
    html += `<h3>Did you know?</h3><ul>`;
    for (const f of facts) html += `<li>${f}</li>`;
    html += `</ul>`;
  }
  if (stats && Object.keys(stats).length) {
    html += `<h3>Quick stats</h3><dl>`;
    for (const [k, v] of Object.entries(stats))
      html += `<dt>${k}</dt><dd>${v}</dd>`;
    html += `</dl>`;
  }
  return html;
}
function setDetails(obj, opts) {
  obj.userData.details = buildDetails(opts);
  obj.userData.detailsData = opts;
}

const WC = "https://upload.wikimedia.org/wikipedia/commons/thumb";

setDetails(sun, {
  tagline: "Our home star",
  image: `${WC}/b/b4/The_Sun_by_the_Atmospheric_Imaging_Assembly_of_NASA%27s_Solar_Dynamics_Observatory_-_20100819.jpg/400px-The_Sun_by_the_Atmospheric_Imaging_Assembly_of_NASA%27s_Solar_Dynamics_Observatory_-_20100819.jpg`,
  credit: "Image: NASA / SDO",
  intro: [
    `The <strong>Sun</strong> is a giant ball of glowing gas, mostly hydrogen, and its gravity is what keeps every planet, moon, asteroid and comet in our solar system from flying off into space.`,
    `It's not on fire like a campfire. It's a <strong>giant fusion reactor</strong>: every second, it squashes 600 million tonnes of hydrogen into helium, and the leftover energy is what we feel as sunlight.`,
  ],
  facts: [
    `It's <strong>1.4 million km</strong> across, you could line up about <strong>109 Earths</strong> across it, or fit a million inside.`,
    `The Sun makes up <strong>99.86%</strong> of all the mass in the solar system. Everything else combined is the leftover crumbs.`,
    `Light from the Sun takes about <strong>8 minutes and 20 seconds</strong> to reach your eyes. So you're always seeing the past!`,
    `The surface is around <strong>5,500°C</strong>, but the corona (its outer atmosphere) is over <strong>1,000,000°C</strong>. Nobody fully knows why.`,
    `In about <strong>5 billion years</strong> it'll swell into a red giant, big enough to swallow Mercury, Venus, and maybe Earth.`,
  ],
  stats: {
    Type: "Yellow dwarf star",
    Width: "1,392,700 km",
    Mass: "333,000 × Earth",
    "Surface temp": "~5,500 °C",
    Age: "~4.6 billion years",
  },
});

setDetails(mercury, {
  tagline: "The speedy little oven",
  image: `${WC}/4/4a/Mercury_in_color_-_Prockter07-edit1.jpg/400px-Mercury_in_color_-_Prockter07-edit1.jpg`,
  credit: "Image: NASA / MESSENGER",
  intro: [
    `<strong>Mercury</strong> is the smallest planet and the closest one to the Sun. It zips around its orbit faster than anything else, that's how it got its name (Mercury was the speedy messenger of the Roman gods).`,
    `It's basically a <strong>cratered rock</strong>, almost no atmosphere, looking a lot like our Moon.`,
  ],
  facts: [
    `Days on Mercury are <strong>brutal</strong>: <strong>+430°C</strong> in the sun, <strong>−180°C</strong> at night. That's the biggest temperature swing of any planet.`,
    `A <strong>year</strong> on Mercury (one trip around the Sun) is only <strong>88 Earth days</strong>.`,
    `But a <strong>day</strong> on Mercury (one full sunrise to sunrise) takes <strong>176 Earth days</strong>. So a Mercury "day" is twice as long as its "year"!`,
    `Even though it's the closest planet to the Sun, scientists think there's <strong>frozen water</strong> hiding in shadowed craters near its poles.`,
    `It has <strong>no moons</strong> and no rings.`,
  ],
  stats: {
    Width: "4,879 km (smallest planet)",
    "Distance from Sun": "58 million km",
    "Year length": "88 Earth days",
    "Day length": "176 Earth days",
    Moons: "0",
  },
});

setDetails(venus, {
  tagline: "Earth's evil twin",
  image: `${WC}/e/e5/Venus-real_color.jpg/400px-Venus-real_color.jpg`,
  credit: "Image: NASA / Mariner 10",
  intro: [
    `<strong>Venus</strong> is almost exactly the same size as Earth, but if Earth is your friendly neighbour, Venus is the one you'd never visit.`,
    `It's wrapped in thick clouds of <strong>sulfuric acid</strong>, the air is 90 times heavier than ours, and it rains acid that evaporates before hitting the ground.`,
  ],
  facts: [
    `Venus is the <strong>hottest planet</strong> in the solar system, about <strong>465°C</strong>, hot enough to melt lead, even hotter than Mercury, which is closer to the Sun!`,
    `That's because of a runaway <strong>greenhouse effect</strong>: its thick atmosphere traps the Sun's heat and never lets it out.`,
    `Venus spins <strong>backwards</strong> compared to most planets. On Venus, the Sun rises in the west.`,
    `It spins so slowly that <strong>one Venus day is longer than one Venus year</strong>: 243 Earth days vs 225.`,
    `It's the brightest natural object in the night sky after the Moon, that's why people call it the "morning star" or "evening star."`,
  ],
  stats: {
    Width: "12,104 km",
    "Distance from Sun": "108 million km",
    "Year length": "225 Earth days",
    "Day length": "243 Earth days (backwards!)",
    Moons: "0",
    "Surface temp": "~465 °C",
  },
});

setDetails(earth, {
  tagline: "The blue marble",
  image: `${WC}/9/97/The_Earth_seen_from_Apollo_17.jpg/400px-The_Earth_seen_from_Apollo_17.jpg`,
  credit: "Image: NASA / Apollo 17 (1972)",
  intro: [
    `<strong>Earth</strong> is the only place we've ever found that has life. Anything alive that you've ever seen, heard about, eaten, or been, it all comes from this one little blue ball.`,
    `From space it looks calm and beautiful, but it's actually a <strong>spinning, churning, magnetic ball of rock and water</strong> with a molten iron core.`,
  ],
  facts: [
    `Earth spins at about <strong>1,670 km/h</strong> at the equator. You're moving that fast right now and don't even feel it.`,
    `<strong>71%</strong> of the surface is covered in water, but <strong>97%</strong> of that water is salty oceans.`,
    `Earth's <strong>magnetic field</strong> is created by molten iron sloshing around the core. It shields us from the Sun's nastiest radiation.`,
    `The atmosphere is mostly <strong>nitrogen (78%)</strong> and <strong>oxygen (21%)</strong>, a tiny bit of everything else.`,
    `Earth is the <strong>only planet</strong> not named after a Greek or Roman god. The name just means "ground."`,
    `Mount Everest is the tallest mountain above sea level, but Mauna Kea (in Hawaii) is taller from base to peak, most of it is underwater.`,
  ],
  stats: {
    Width: "12,742 km",
    "Distance from Sun": "150 million km (1 AU)",
    "Year length": "365.25 days",
    "Day length": "23 h 56 min",
    Moons: "1",
    Atmosphere: "78% N₂, 21% O₂",
  },
});

setDetails(moon, {
  tagline: "Our nightlight",
  image: `${WC}/e/e1/FullMoon2010.jpg/400px-FullMoon2010.jpg`,
  credit: "Image: Gregory H. Revera",
  intro: [
    `The <strong>Moon</strong> is Earth's only natural satellite. Without it, life on Earth would be very different, it stabilises our tilt and gives us tides.`,
    `Scientists think the Moon formed when a <strong>Mars-sized object slammed into baby Earth</strong> about 4.5 billion years ago, and the debris clumped together.`,
  ],
  facts: [
    `The Moon always shows us the <strong>same face</strong>. It spins at exactly the same rate it orbits, that's called being "tidally locked."`,
    `Footprints left by the <strong>Apollo astronauts</strong> from 1969 to 1972 are still there. There's no wind or rain to wipe them away.`,
    `Only <strong>12 humans</strong> have ever walked on the Moon, all between 1969 and 1972.`,
    `The Moon is <strong>drifting away</strong> from Earth at about <strong>3.8 cm per year</strong>, about as fast as your fingernails grow.`,
    `If you could drive a car to the Moon at highway speed, it would take you about <strong>5 months</strong>.`,
    `The dark patches you see are called <strong>maria</strong> (Latin for "seas"), they're frozen lava plains, not water.`,
  ],
  stats: {
    Width: "3,474 km (~¼ of Earth)",
    "Distance from Earth": "384,400 km",
    "Orbit length": "27.3 days",
    Gravity: "1/6 of Earth's",
    "Surface temp": "−170 °C to +120 °C",
  },
});

setDetails(mars, {
  tagline: "The rusty red one",
  image: `${WC}/0/02/OSIRIS_Mars_true_color.jpg/400px-OSIRIS_Mars_true_color.jpg`,
  credit: "Image: ESA / Rosetta",
  intro: [
    `<strong>Mars</strong> is the rusty red neighbour. It's about half the size of Earth and the most likely place in the solar system where humans might one day live.`,
    `The red colour comes from <strong>iron oxide</strong>, basically the entire planet is covered in rust.`,
  ],
  facts: [
    `<strong>Olympus Mons</strong>, the biggest volcano in the solar system, is on Mars. It's about <strong>22 km tall</strong>, three times the height of Mount Everest.`,
    `Mars has <strong>two tiny potato-shaped moons</strong>, Phobos and Deimos. Phobos is so close it'll eventually crash into Mars or break into a ring.`,
    `A day on Mars is almost the same as Earth: <strong>24 hours and 37 minutes</strong>. Astronauts on Mars wouldn't have to change their watches much.`,
    `It has the <strong>biggest dust storms</strong> in the solar system, sometimes the entire planet is covered for months.`,
    `There's <strong>frozen water</strong> at the poles and signs that liquid water once flowed across the surface billions of years ago.`,
    `Multiple <strong>robot rovers</strong> are exploring the surface right now (Curiosity, Perseverance), your nephew is alive at the same time as Martian rovers!`,
  ],
  stats: {
    Width: "6,779 km",
    "Distance from Sun": "228 million km",
    "Year length": "687 Earth days",
    "Day length": "24 h 37 min",
    Moons: "2 (Phobos, Deimos)",
    Gravity: "38% of Earth's",
  },
});

setDetails(jupiter, {
  tagline: "The king of the planets",
  image: `${WC}/2/2b/Jupiter_and_its_shrunken_Great_Red_Spot.jpg/400px-Jupiter_and_its_shrunken_Great_Red_Spot.jpg`,
  credit: "Image: NASA / Hubble",
  intro: [
    `<strong>Jupiter</strong> is the boss of the planets, bigger than every other planet combined, and over <strong>twice the mass</strong> of all of them put together.`,
    `It's a <strong>gas giant</strong>, meaning there's no surface to land on. If you tried, you'd fall through hydrogen and helium clouds for thousands of kilometres until you got crushed.`,
  ],
  facts: [
    `The <strong>Great Red Spot</strong> is a hurricane <strong>bigger than Earth</strong>. It's been raging for at least <strong>350 years</strong>, and is finally starting to shrink.`,
    `Jupiter spins so fast that one day there is just <strong>under 10 hours</strong>, the fastest day of any planet.`,
    `It has at least <strong>95 known moons</strong>. The four biggest, <strong>Io, Europa, Ganymede, Callisto</strong>, were spotted by Galileo in 1610 with a tiny telescope.`,
    `<strong>Ganymede</strong> is bigger than the planet Mercury. If it orbited the Sun instead of Jupiter, we'd call it a planet.`,
    `<strong>Europa</strong> has a frozen ocean of liquid water under its ice, one of the best places in the solar system to look for alien life.`,
    `Jupiter has rings too! They're just thin and dusty, so you usually can't see them.`,
    `Jupiter is like a <strong>cosmic vacuum cleaner</strong>: its huge gravity slingshots a lot of asteroids and comets away from the inner planets, protecting Earth.`,
  ],
  stats: {
    Width: "139,820 km (11 × Earth)",
    Mass: "318 × Earth",
    "Distance from Sun": "778 million km",
    "Year length": "12 Earth years",
    "Day length": "~10 hours",
    Moons: "95+",
  },
});

setDetails(saturn, {
  tagline: "The ringed showoff",
  image: `${WC}/c/c7/Saturn_during_Equinox.jpg/400px-Saturn_during_Equinox.jpg`,
  credit: "Image: NASA / Cassini",
  intro: [
    `<strong>Saturn</strong> is famous for its rings, the most spectacular set of rings in the solar system, made of <strong>billions of pieces of ice and rock</strong>, from grains of dust to chunks the size of a house.`,
    `It's the second biggest planet, also a gas giant, and it's so puffy that if you could find a bathtub big enough, <strong>Saturn would float in water</strong>.`,
  ],
  facts: [
    `The rings are <strong>280,000 km wide</strong>, almost the distance from Earth to the Moon, but typically <strong>less than 1 km thick</strong>. They're like a giant flat pancake.`,
    `Saturn has at least <strong>146 moons</strong>. The biggest, <strong>Titan</strong>, is the only moon in the solar system with a thick atmosphere, and it has lakes of <strong>liquid methane</strong>.`,
    `Another moon, <strong>Enceladus</strong>, shoots geysers of water out of its south pole, strong evidence of a hidden ocean.`,
    `There's a giant <strong>hexagon-shaped storm</strong> at Saturn's north pole. Nobody is fully sure how a hexagon forms in clouds.`,
    `Saturn's rings will eventually <strong>disappear</strong>, they're slowly raining down onto the planet over millions of years.`,
    `Saturn's wind speeds can hit <strong>1,800 km/h</strong>, way faster than any storm on Earth.`,
  ],
  stats: {
    Width: "116,460 km (9 × Earth)",
    "Distance from Sun": "1.4 billion km",
    "Year length": "29 Earth years",
    "Day length": "10 h 42 min",
    Moons: "146+",
    Rings: "Hundreds, made mostly of ice",
  },
});

setDetails(uranus, {
  tagline: "The sideways planet",
  image: `${WC}/3/3d/Uranus2.jpg/400px-Uranus2.jpg`,
  credit: "Image: NASA / Voyager 2",
  intro: [
    `<strong>Uranus</strong> is the weird one. While every other planet spins more or less upright, Uranus is <strong>tipped over on its side</strong>, its axis is tilted nearly <strong>98°</strong>.`,
    `Scientists think it got hit by something <strong>Earth-sized</strong> billions of years ago, and the impact knocked it over. It's been rolling around the Sun like a barrel ever since.`,
  ],
  facts: [
    `Because of the sideways tilt, each pole gets <strong>42 years of sunlight</strong> followed by <strong>42 years of darkness</strong>. Wild summers, brutal winters.`,
    `Uranus is an <strong>ice giant</strong>, its blue colour comes from <strong>methane</strong> in its atmosphere, which absorbs red light.`,
    `It's the <strong>coldest planet</strong> in the solar system, even though Neptune is further away. Temperatures can drop to <strong>−224°C</strong>.`,
    `It has <strong>13 thin rings</strong>, much darker than Saturn's, they were only discovered in 1977.`,
    `Most of its <strong>27 moons</strong> are named after characters from Shakespeare and Alexander Pope, like Titania, Oberon, Puck, and Ariel.`,
    `One year on Uranus = <strong>84 Earth years</strong>. Most people only experience one Uranian year in their entire life.`,
  ],
  stats: {
    Width: "50,724 km (4 × Earth)",
    "Distance from Sun": "2.9 billion km",
    "Year length": "84 Earth years",
    "Day length": "17 h 14 min",
    Tilt: "97.8° (on its side!)",
    Moons: "27",
  },
});

setDetails(neptune, {
  tagline: "The windy blue giant",
  image: `${WC}/5/56/Neptune_Full.jpg/400px-Neptune_Full.jpg`,
  credit: "Image: NASA / Voyager 2",
  intro: [
    `<strong>Neptune</strong> is the furthest "real" planet from the Sun, a deep blue ice giant out in the cold dark.`,
    `It's so far away that the Sun looks like just a really bright star from there. Sunlight there is about <strong>900 times dimmer</strong> than on Earth.`,
  ],
  facts: [
    `Neptune has the <strong>fastest winds</strong> in the solar system, storms whip across the surface at <strong>2,000 km/h</strong>, faster than the speed of sound on Earth.`,
    `It was the <strong>first planet found by maths</strong>, not by looking. Astronomers noticed Uranus was wobbling, calculated where the gravity was coming from, pointed a telescope there in 1846, and there was Neptune.`,
    `One year on Neptune = <strong>165 Earth years</strong>. Since its discovery in 1846, it has only completed <strong>one orbit around the Sun</strong>.`,
    `Its biggest moon, <strong>Triton</strong>, orbits backwards, meaning it was probably a Kuiper belt object that Neptune captured.`,
    `Triton has <strong>nitrogen geysers</strong> shooting up from its surface, even though it's −235°C.`,
    `Neptune has <strong>5 main rings</strong> (Galle, Le Verrier, Lassell, Arago, Adams), but they're faint and clumpy, not smooth like Saturn's.`,
  ],
  stats: {
    Width: "49,244 km (4 × Earth)",
    "Distance from Sun": "4.5 billion km",
    "Year length": "165 Earth years",
    "Day length": "16 h 6 min",
    "Top wind speed": "~2,000 km/h",
    Moons: "14",
  },
});

setDetails(ceres, {
  tagline: "The asteroid-belt dwarf",
  image: `${WC}/9/94/Ceres_-_RC3_-_Haulani_Crater_%2822381131691%29.jpg/400px-Ceres_-_RC3_-_Haulani_Crater_%2822381131691%29.jpg`,
  credit: "Image: NASA / Dawn",
  intro: [
    `<strong>Ceres</strong> is a dwarf planet hiding in the <strong>asteroid belt</strong> between Mars and Jupiter. It's the biggest object in that belt, about the size of Texas.`,
    `When it was discovered in 1801 it was called the <strong>eighth planet</strong>! Then more rocks were found nearby, and it got reclassified as an asteroid. In 2006, it was promoted again to "dwarf planet."`,
  ],
  facts: [
    `Ceres makes up about <strong>1/3 of all the mass</strong> in the asteroid belt by itself.`,
    `Its surface has weird <strong>bright spots</strong> in some craters, they're salt deposits left behind by water that bubbled up and froze.`,
    `Scientists think there's a <strong>layer of liquid water</strong> deep under the icy crust, making it one of the best places to look for life nearby.`,
    `It's the only dwarf planet in the inner solar system. All the others (Pluto, Eris, etc.) are way out beyond Neptune.`,
  ],
  stats: {
    Width: "940 km",
    "Distance from Sun": "414 million km",
    "Year length": "4.6 Earth years",
    "Day length": "9 hours",
    Discovered: "1801",
  },
});

setDetails(pluto, {
  tagline: "The famous ex-planet",
  image: `${WC}/2/2a/Nh-pluto-in-true-color_2x_JPEG-edit-frame.jpg/400px-Nh-pluto-in-true-color_2x_JPEG-edit-frame.jpg`,
  credit: "Image: NASA / New Horizons",
  intro: [
    `<strong>Pluto</strong> was the ninth planet from <strong>1930 to 2006</strong>. Then astronomers found loads of similar-sized objects nearby (Eris, Makemake, Haumea…) and decided to make a new category: <strong>dwarf planets</strong>.`,
    `Lots of people are still grumpy about it.`,
  ],
  facts: [
    `Pluto is <strong>smaller than Earth's Moon</strong>, about <strong>2,377 km</strong> wide.`,
    `It has a giant <strong>heart-shaped patch</strong> of frozen nitrogen on its surface called <strong>Tombaugh Regio</strong>, named after Pluto's discoverer.`,
    `Its biggest moon, <strong>Charon</strong>, is half Pluto's size. They orbit each other so closely that they're almost a <strong>double dwarf-planet</strong>.`,
    `In 2015 the <strong>New Horizons</strong> spacecraft flew past and gave us our first real close-up photos. Before that, all our best images were just blurry dots.`,
    `One Pluto year = <strong>248 Earth years</strong>. Since its discovery in 1930, it hasn't even gone halfway around the Sun yet.`,
    `Pluto has mountains made of <strong>solid water ice</strong>, at −230°C, ice is hard as rock.`,
  ],
  stats: {
    Width: "2,377 km",
    "Distance from Sun": "5.9 billion km",
    "Year length": "248 Earth years",
    "Day length": "6.4 Earth days",
    Moons: "5 (Charon, Nix, Hydra, Kerberos, Styx)",
    Demoted: "2006 😢",
  },
});

setDetails(haumea, {
  tagline: "The football-shaped one",
  image: `${WC}/3/3c/2003EL61art.jpg/400px-2003EL61art.jpg`,
  credit: "Artist impression: A. Feild / STScI",
  intro: [
    `<strong>Haumea</strong> is one of the strangest dwarf planets, it's stretched out like an <strong>American football</strong> because it spins so incredibly fast.`,
  ],
  facts: [
    `A day on Haumea is just <strong>under 4 hours long</strong>, one of the fastest spinning objects in the solar system.`,
    `It's so spinny that the centrifugal force has stretched the whole planet into an oval shape.`,
    `It has <strong>two tiny moons</strong> (Hi'iaka and Namaka) and a <strong>thin ring</strong>, the first ring ever spotted around a dwarf planet.`,
    `It's named after the <strong>Hawaiian goddess</strong> of childbirth and fertility.`,
  ],
  stats: {
    Shape: "Stretched oval (~2,100 × 1,700 × 1,000 km)",
    "Distance from Sun": "6.5 billion km",
    "Year length": "285 Earth years",
    "Day length": "~4 hours",
    Moons: "2",
  },
});

setDetails(makemake, {
  tagline: "The Easter Island dwarf",
  image: `${WC}/7/79/Makemake_moon_Hubble_image_with_legend_%28cropped%29.jpg/400px-Makemake_moon_Hubble_image_with_legend_%28cropped%29.jpg`,
  credit: "Image: NASA / Hubble",
  intro: [
    `<strong>Makemake</strong> (say it: "MAH-kee MAH-kee") is a dwarf planet in the Kuiper belt. Its surface is covered in <strong>frozen methane</strong>, giving it a reddish-brown colour.`,
  ],
  facts: [
    `It was discovered shortly after Easter 2005 and named after <strong>Makemake</strong>, the creator god of the Rapa Nui people of Easter Island.`,
    `It's one of the <strong>brightest</strong> objects out beyond Neptune.`,
    `It has <strong>one tiny moon</strong>, nicknamed MK2, which is so dark it took years to spot.`,
    `Like Pluto, it has methane and nitrogen ices on its surface that probably puff up into a thin atmosphere when it's closest to the Sun.`,
  ],
  stats: {
    Width: "~1,430 km",
    "Distance from Sun": "6.8 billion km",
    "Year length": "305 Earth years",
    Discovered: "2005",
    Moons: "1",
  },
});

setDetails(eris, {
  tagline: "The reason Pluto got demoted",
  image: `${WC}/4/4f/Eris_and_dysnomia2.jpg/400px-Eris_and_dysnomia2.jpg`,
  credit: "Image: NASA / Hubble",
  intro: [
    `<strong>Eris</strong> is the dwarf planet that started a fight. When astronomers found it in 2005 and realised it was about <strong>Pluto's size</strong>, they had to decide: do we call Eris a planet too, or change the rules?`,
    `They changed the rules, and Pluto became a dwarf planet. Eris is named after the <strong>Greek goddess of strife and chaos</strong>, which is pretty appropriate.`,
  ],
  facts: [
    `Eris is roughly the same size as Pluto but is actually <strong>more massive</strong>, it's the heaviest dwarf planet we know of.`,
    `It's so far away that one orbit takes <strong>557 Earth years</strong>.`,
    `Its surface is <strong>extremely reflective</strong>, almost like fresh snow, because nitrogen freezes solid in the ridiculous cold (−230°C).`,
    `It has one moon, <strong>Dysnomia</strong>, named after the daughter of Eris (goddess of lawlessness).`,
  ],
  stats: {
    Width: "2,326 km",
    "Distance from Sun": "~10 billion km",
    "Year length": "557 Earth years",
    Discovered: "2005",
    Moons: "1 (Dysnomia)",
  },
});

for (const s of namedStars) {
  if (s.userData.name === "Sirius")
    setDetails(s, {
      tagline: "The brightest star in the sky",
      image: `${WC}/b/b2/Sirius_A_and_B_Hubble_photo.jpg/400px-Sirius_A_and_B_Hubble_photo.jpg`,
      credit: "Image: NASA / Hubble",
      intro: [
        `<strong>Sirius</strong> is the brightest star in the night sky (after the Sun). You can spot it on winter nights low on the horizon, it twinkles like crazy and sometimes flashes red, white, and blue.`,
      ],
      facts: [
        `It's only <strong>8.6 light-years</strong> away, practically next door, in cosmic terms.`,
        `It's actually <strong>two stars</strong>: a bright blue-white star (Sirius A) and a tiny dense companion (Sirius B), called the "Pup."`,
        `Sirius B is a <strong>white dwarf</strong>, the leftover core of a dead star, about the size of Earth but with the mass of the Sun. A teaspoon of it would weigh tonnes.`,
        `The ancient Egyptians used Sirius as their <strong>calendar</strong>, when it first appeared in the dawn sky each year, the Nile was about to flood.`,
        `Its name means <strong>"glowing"</strong> or "scorching" in ancient Greek.`,
      ],
      stats: {
        Distance: "8.6 light-years",
        Brightness: "~25 × the Sun",
        Type: "A1V main-sequence (with white-dwarf companion)",
      },
    });
  if (s.userData.name === "Betelgeuse")
    setDetails(s, {
      tagline: "The dying red supergiant",
      image: `${WC}/0/02/Betelgeuse_captured_by_ALMA.jpg/400px-Betelgeuse_captured_by_ALMA.jpg`,
      credit: "Image: ALMA (ESO/NAOJ/NRAO)",
      intro: [
        `<strong>Betelgeuse</strong> (say it: "BET-el-juice") is one of the biggest stars you can see with your eyes. It's the <strong>red shoulder of Orion</strong>.`,
        `It's a <strong>red supergiant</strong>, a star that has burned through its hydrogen fuel and puffed up to a monstrous size.`,
      ],
      facts: [
        `If you put Betelgeuse where the Sun is, it would <strong>swallow Mercury, Venus, Earth, and Mars</strong>, and reach almost out to Jupiter.`,
        `It's around <strong>700 light-years</strong> away.`,
        `It's nearing the end of its life and will eventually <strong>explode as a supernova</strong>. Could be tomorrow, could be 100,000 years from now.`,
        `When it goes, it'll briefly be as <strong>bright as the full Moon</strong>, even in the daytime, visible for months.`,
        `Between 2019 and 2020 it suddenly <strong>dimmed dramatically</strong>, making people wonder if it was about to blow. Turned out it just burped out a giant cloud of dust.`,
      ],
      stats: {
        Distance: "~700 light-years",
        Diameter: "~700 × the Sun",
        Type: "Red supergiant (M1-2 Iab)",
        Age: "~10 million years",
      },
    });
  if (s.userData.name === "Rigel")
    setDetails(s, {
      tagline: "The blue supergiant in Orion",
      image: `${WC}/0/0d/Rigel%2C_alpha_Lyrae%2C_Sirius%2C_Procyon_and_Canopus_relative_sizes.png/400px-Rigel%2C_alpha_Lyrae%2C_Sirius%2C_Procyon_and_Canopus_relative_sizes.png`,
      credit: "Star size comparison",
      intro: [
        `<strong>Rigel</strong> is the bright blue star at the bottom of the constellation <strong>Orion</strong>, the hunter's foot.`,
        `It's a <strong>blue supergiant</strong>, one of the most luminous stars visible to the naked eye.`,
      ],
      facts: [
        `Rigel shines about <strong>120,000 times brighter</strong> than the Sun.`,
        `Its surface burns at around <strong>12,000°C</strong>, twice as hot as the Sun. That's why it looks blue-white instead of yellow.`,
        `It's around <strong>860 light-years</strong> away, the light you see tonight left Rigel around the year 1160.`,
        `Like Sirius, it's actually a system: <strong>at least four stars</strong> orbiting each other.`,
        `Rigel will also explode as a <strong>supernova</strong> someday, sometime in the next few million years.`,
      ],
      stats: {
        Distance: "~860 light-years",
        Brightness: "~120,000 × the Sun",
        Type: "Blue supergiant (B8 Ia)",
        "Surface temp": "~12,000 °C",
      },
    });
}

setDetails(blackHole, {
  tagline: "A bottomless gravity well",
  image: `${WC}/4/4f/Black_hole_-_Messier_87_crop_max_res.jpg/400px-Black_hole_-_Messier_87_crop_max_res.jpg`,
  credit: "Image: Event Horizon Telescope (M87*)",
  intro: [
    `A <strong>black hole</strong> is a place where gravity is so strong that <strong>nothing can escape</strong>, not even light. Once something falls in, it's gone forever.`,
    `Black holes form when a really massive star <strong>runs out of fuel and collapses</strong> in on itself. The matter gets squashed into a single point with infinite density called a <strong>singularity</strong>.`,
    `The one in this scene is styled after <strong>Gargantua</strong> from the movie <em>Interstellar</em>, and like real black holes, it bends light around itself, making the disc of glowing matter wrap up over the top.`,
  ],
  facts: [
    `The boundary around a black hole is called the <strong>event horizon</strong>. Cross it and you can never come back, not even light is fast enough.`,
    `If you fell into a black hole feet-first, you'd be stretched out into a long noodle by the gravity difference between your feet and your head. Scientists actually call this <strong>"spaghettification."</strong>`,
    `Time slows down near a black hole. Someone falling in would seem to <strong>freeze in slow motion</strong> from your point of view, never quite reaching the edge.`,
    `In 2019, scientists released the <strong>first-ever photo of a black hole</strong>, the supermassive one in the centre of galaxy M87, 53 million light-years away.`,
    `There's a <strong>supermassive black hole</strong> at the centre of almost every galaxy, including ours. It's called <strong>Sagittarius A*</strong> and it's about <strong>4 million times</strong> the mass of the Sun.`,
    `Black holes can <strong>spin</strong>, and the fastest ones drag space itself around with them, like a whirlpool.`,
  ],
  stats: {
    What: "Region where gravity beats light",
    Boundary: "Event horizon",
    "Discovered (real)": "M87* photographed in 2019",
    "Try this": "While zoomed in, click around the scene to feed it!",
  },
});

// --- raycasting ---
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(-10, -10);
let hovered = null;

canvas.addEventListener("pointermove", (e) => {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  hoverLabel.style.left = e.clientX + "px";
  hoverLabel.style.top = e.clientY + "px";
});

canvas.addEventListener("pointerdown", () =>
  document.body.classList.add("grabbing"),
);
window.addEventListener("pointerup", () =>
  document.body.classList.remove("grabbing"),
);

// --- camera tween ---
const camTween = {
  active: false,
  t: 0,
  dur: 1.2,
  fromPos: new THREE.Vector3(),
  toPos: new THREE.Vector3(),
  fromTarget: new THREE.Vector3(),
  toTarget: new THREE.Vector3(),
  followObj: null,
};

let followObj = null;
const lastFollowPos = new THREE.Vector3();

function flyTo(targetObj) {
  const targetWorld = new THREE.Vector3();
  targetObj.getWorldPosition(targetWorld);
  const dist = targetObj.userData.viewDist || 20;
  const dir = new THREE.Vector3()
    .subVectors(camera.position, targetWorld)
    .normalize();
  if (dir.lengthSq() < 0.001) dir.set(0, 0.4, 1).normalize();
  const newPos = targetWorld.clone().add(dir.multiplyScalar(dist));
  camTween.fromPos.copy(camera.position);
  camTween.toPos.copy(newPos);
  camTween.fromTarget.copy(controls.target);
  camTween.toTarget.copy(targetWorld);
  camTween.t = 0;
  camTween.active = true;
  camTween.followObj = targetObj;
  followObj = null; // pause following during tween
  controls.enabled = false;
}

const homePos = camera.position.clone();
const homeTarget = new THREE.Vector3(0, 0, 0);

function flyHome() {
  if (typeof tour !== "undefined" && tour && tour.active) tour.exit();
  if (typeof exitGalaxyMode === "function") exitGalaxyMode();
  camTween.fromPos.copy(camera.position);
  camTween.toPos.copy(homePos);
  camTween.fromTarget.copy(controls.target);
  camTween.toTarget.copy(homeTarget);
  camTween.t = 0;
  camTween.active = true;
  camTween.followObj = null;
  followObj = null;
  controls.enabled = false;
  exitFeedMode();
  hideCaption();
  backBtn.hidden = true;
}

// ---- Galaxy view: a proper top-down Milky Way ----
const galaxyGroup = new THREE.Group();
galaxyGroup.visible = false;
scene.add(galaxyGroup);
let galaxyHiddenSnapshot = null;

(function buildMilkyWay() {
  const GAL_R = 600;       // outer galaxy radius
  const BULGE_R = 110;     // central bulge radius
  const ARMS = 4;
  const TWIST = 4.6;       // how many full turns from centre to edge

  // ----- Central bulge (warm yellow/orange, dense) -----
  const bulgeCount = 5000;
  const bp = new Float32Array(bulgeCount * 3);
  const bc = new Float32Array(bulgeCount * 3);
  for (let i = 0; i < bulgeCount; i++) {
    const r = Math.pow(Math.random(), 2.2) * BULGE_R;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const flatten = 0.45;
    bp[i*3]     = r * Math.sin(phi) * Math.cos(theta);
    bp[i*3 + 1] = r * Math.cos(phi) * flatten;
    bp[i*3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    const t = 1 - r / BULGE_R;
    bc[i*3]     = 1.0;
    bc[i*3 + 1] = 0.82 + t * 0.12;
    bc[i*3 + 2] = 0.55 + t * 0.25;
  }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute("position", new THREE.BufferAttribute(bp, 3));
  bg.setAttribute("color", new THREE.BufferAttribute(bc, 3));
  galaxyGroup.add(new THREE.Points(bg, new THREE.PointsMaterial({
    size: 2.6, vertexColors: true, sizeAttenuation: true,
    transparent: true, opacity: 0.95, map: roundPointTex,
    alphaTest: 0.05, depthWrite: false, blending: THREE.AdditiveBlending,
  })));

  // ----- Spiral arms (blue/white hot stars) -----
  const armCount = 30000;
  const ap = new Float32Array(armCount * 3);
  const ac = new Float32Array(armCount * 3);
  for (let i = 0; i < armCount; i++) {
    const arm = i % ARMS;
    // Push more stars toward the outer disc, but keep some near the bulge
    const rFrac = Math.pow(Math.random(), 0.85);
    const r = BULGE_R * 0.7 + rFrac * (GAL_R - BULGE_R * 0.7);
    // Spiral angle: each arm offset by 2π/ARMS, plus twist proportional to radius
    const armAngle = (arm / ARMS) * Math.PI * 2;
    const twistAngle = (r / GAL_R) * TWIST * Math.PI * 2;
    // Spread perpendicular to the arm centreline (thicker near centre)
    const spread = (1 - rFrac * 0.6) * 0.42;
    const wobble = (Math.random() - 0.5) * spread;
    const theta = armAngle + twistAngle + wobble;
    // Thin disc + slight thickness, thinner at the rim
    const thickness = 18 * (1 - rFrac * 0.7);
    const y = (Math.random() - 0.5) * thickness * 2 * (Math.random() ** 1.5);
    ap[i*3]     = r * Math.cos(theta);
    ap[i*3 + 1] = y;
    ap[i*3 + 2] = r * Math.sin(theta);
    // Colour: bluer in arms, slightly warmer mixed in
    const blueish = Math.random() < 0.7;
    const b = 0.55 + Math.random() * 0.4;
    if (blueish) {
      ac[i*3]     = b * 0.75;
      ac[i*3 + 1] = b * 0.88;
      ac[i*3 + 2] = Math.min(1, b + 0.18);
    } else {
      ac[i*3]     = Math.min(1, b + 0.15);
      ac[i*3 + 1] = b * 0.92;
      ac[i*3 + 2] = b * 0.78;
    }
  }
  const ag = new THREE.BufferGeometry();
  ag.setAttribute("position", new THREE.BufferAttribute(ap, 3));
  ag.setAttribute("color", new THREE.BufferAttribute(ac, 3));
  galaxyGroup.add(new THREE.Points(ag, new THREE.PointsMaterial({
    size: 1.8, vertexColors: true, sizeAttenuation: true,
    transparent: true, opacity: 0.9, map: roundPointTex,
    alphaTest: 0.05, depthWrite: false, blending: THREE.AdditiveBlending,
  })));

  // ----- Dust haze on the disc (soft glow) -----
  const hazeCount = 8000;
  const hp = new Float32Array(hazeCount * 3);
  const hc = new Float32Array(hazeCount * 3);
  for (let i = 0; i < hazeCount; i++) {
    const arm = i % ARMS;
    const rFrac = Math.pow(Math.random(), 0.8);
    const r = BULGE_R * 0.6 + rFrac * (GAL_R - BULGE_R * 0.6);
    const armAngle = (arm / ARMS) * Math.PI * 2;
    const twistAngle = (r / GAL_R) * TWIST * Math.PI * 2;
    const wobble = (Math.random() - 0.5) * 0.7;
    const theta = armAngle + twistAngle + wobble;
    hp[i*3]     = r * Math.cos(theta);
    hp[i*3 + 1] = (Math.random() - 0.5) * 18;
    hp[i*3 + 2] = r * Math.sin(theta);
    const t = 0.15 + Math.random() * 0.18;
    hc[i*3]     = t * 1.0;
    hc[i*3 + 1] = t * 0.85;
    hc[i*3 + 2] = t * 0.7;
  }
  const hg = new THREE.BufferGeometry();
  hg.setAttribute("position", new THREE.BufferAttribute(hp, 3));
  hg.setAttribute("color", new THREE.BufferAttribute(hc, 3));
  galaxyGroup.add(new THREE.Points(hg, new THREE.PointsMaterial({
    size: 9, vertexColors: true, sizeAttenuation: true,
    transparent: true, opacity: 0.55, map: roundPointTex,
    alphaTest: 0.02, depthWrite: false, blending: THREE.AdditiveBlending,
  })));

  // ----- "You are here" marker at the Sun's position in the galaxy -----
  // Sun sits ~26,000 ly from the centre; galaxy ~50,000 ly across.
  const sunR = GAL_R * 0.52;
  const sunArm = 0; // place on the first arm so it lands on a visible arm
  const sunAngle = (sunArm / ARMS) * Math.PI * 2 + (sunR / GAL_R) * TWIST * Math.PI * 2;
  const sunPos = new THREE.Vector3(
    sunR * Math.cos(sunAngle),
    2,
    sunR * Math.sin(sunAngle),
  );
  const youDot = new THREE.Sprite(new THREE.SpriteMaterial({
    map: roundPointTex,
    color: 0xffd166,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  youDot.position.copy(sunPos);
  youDot.scale.setScalar(28);
  galaxyGroup.add(youDot);

  const youHalo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: roundPointTex,
    color: 0xffd166,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  youHalo.position.copy(sunPos).y += 0.5;
  youHalo.scale.setScalar(80);
  galaxyGroup.add(youHalo);

  // Pulse the halo
  galaxyGroup.userData.youHalo = youHalo;
  galaxyGroup.userData.sunPos = sunPos.clone();
})();

const galaxyPos = new THREE.Vector3(0, 720, 880);
const galaxyTarget = new THREE.Vector3(0, 0, 0);

function enterGalaxyMode() {
  if (galaxyHiddenSnapshot) return;
  galaxyHiddenSnapshot = [];
  for (const child of scene.children) {
    if (child === galaxyGroup) continue;
    galaxyHiddenSnapshot.push([child, child.visible]);
    child.visible = false;
  }
  galaxyGroup.visible = true;
  // Lock view so the galaxy stays centred and visible
  controls.enabled = false;
  // Hide UI bits that don't make sense in this view
  if (typeof hotspotsEl !== "undefined" && hotspotsEl) hotspotsEl.hidden = true;
  if (typeof sectionPop !== "undefined" && sectionPop) sectionPop.hidden = true;
  if (typeof infoToggle !== "undefined" && infoToggle) infoToggle.hidden = true;
  if (typeof infoPanel !== "undefined" && infoPanel) infoPanel.hidden = true;
}

function exitGalaxyMode() {
  if (!galaxyHiddenSnapshot) return;
  for (const [child, vis] of galaxyHiddenSnapshot) child.visible = vis;
  galaxyGroup.visible = false;
  galaxyHiddenSnapshot = null;
  const learnBtn = document.getElementById("galaxy-learn");
  if (learnBtn) learnBtn.hidden = true;
}

// Milky Way fact pack (used by the Learn-more panel in galaxy view)
const MILKY_WAY_DATA = {
  tagline: "Our home galaxy",
  intro: [
    `The <strong>Milky Way</strong> is the galaxy we live in. It's a giant pinwheel of around <strong>100 to 400 billion stars</strong>, all held together by gravity.`,
    `It's a <strong>barred spiral galaxy</strong>: a bright bulge of older stars in the middle, with long curving arms of younger stars, gas and dust sweeping out from it.`,
    `Our Sun, with all its planets including Earth, sits about <strong>26,000 light years</strong> from the centre, out on the <strong>Orion Arm</strong>. That's the yellow dot you see.`,
    `The whole galaxy is roughly <strong>100,000 light years</strong> across. Light, the fastest thing in the universe, would still take a hundred thousand years to cross it.`,
    `At the very centre is a <strong>supermassive black hole</strong> called <strong>Sagittarius A*</strong>, about 4 million times the mass of the Sun.`,
    `Everything in the galaxy is spinning. The Sun takes about <strong>225 million years</strong> to make one full lap around the centre, called a <strong>galactic year</strong>.`,
    `The Milky Way isn't alone. It's part of the <strong>Local Group</strong>, a small cluster of galaxies, and it's slowly drifting toward our giant neighbour <strong>Andromeda</strong>. The two will collide in about 4.5 billion years.`,
  ],
  stats: {
    "Type": "Barred spiral galaxy",
    "Stars": "100 to 400 billion",
    "Width": "About 100,000 light years",
    "Sun's distance from centre": "About 26,000 light years",
    "One galactic year": "About 225 million Earth years",
    "Central black hole": "Sagittarius A*",
  },
};

function openMilkyWayInfo() {
  if (typeof infoPanel === "undefined" || !infoPanel) return;
  if (typeof infoTitle !== "undefined") infoTitle.textContent = "The Milky Way";
  let html = "";
  html += `<div class="info-tagline">${MILKY_WAY_DATA.tagline}</div>`;
  for (const para of MILKY_WAY_DATA.intro) html += `<p>${para}</p>`;
  html += `<div class="quick-stats mw-stats">`;
  const entries = Object.entries(MILKY_WAY_DATA.stats);
  for (const [k, v] of entries) {
    html += `<div class="qs"><div class="qs-k">${k}</div><div class="qs-v">${v}</div></div>`;
  }
  html += `</div>`;
  infoBody.innerHTML = html;
  infoPanel.hidden = false;
}

function flyToGalaxyView() {
  if (typeof tour !== "undefined" && tour && tour.active) tour.exit();
  zoomedOn = null;
  if (typeof infoToggle !== "undefined") infoToggle.hidden = true;
  if (typeof infoPanel !== "undefined") infoPanel.hidden = true;
  if (typeof hideHotspots === "function") hideHotspots();
  enterGalaxyMode();
  const learnBtn = document.getElementById("galaxy-learn");
  if (learnBtn) learnBtn.hidden = false;
  camTween.fromPos.copy(camera.position);
  camTween.toPos.copy(galaxyPos);
  camTween.fromTarget.copy(controls.target);
  camTween.toTarget.copy(galaxyTarget);
  camTween.t = 0;
  camTween.dur = 1.6;
  camTween.active = true;
  camTween.followObj = null;
  followObj = null;
  controls.enabled = false;
  exitFeedMode();
  showCaption("The Milky Way, our galaxy. The yellow dot is us.");
  backBtn.hidden = false;
  setTimeout(() => { camTween.dur = 1.2; }, 1700);
}

// --- Astronaut view from the ISS ---
let issMode = false;
function enterIssMode() {
  if (issMode) return;
  if (!issSatRef) return;
  if (typeof tour !== "undefined" && tour && tour.active) tour.exit();
  if (typeof exitGalaxyMode === "function") exitGalaxyMode();
  if (typeof hideHotspots === "function") hideHotspots();
  if (typeof infoToggle !== "undefined" && infoToggle) infoToggle.hidden = true;
  if (typeof infoPanel !== "undefined" && infoPanel) infoPanel.hidden = true;
  if (typeof launchBtn !== "undefined" && launchBtn) launchBtn.hidden = true;
  const secPop = document.getElementById("section-pop");
  if (secPop) secPop.hidden = true;
  exitFeedMode();
  followObj = null;
  camTween.active = false;
  controls.enabled = false;
  // Force the Earth-orbital scene to render even from far away
  earthOrbital.visible = true;
  issMode = true;
  const hud = document.getElementById("iss-hud");
  const exit = document.getElementById("iss-exit");
  if (hud) hud.hidden = false;
  if (exit) exit.hidden = false;
  // Hide hint, top-bar, minimap while inside the station
  document.body.classList.add("iss-mode");
  showCaption("Astronaut view, looking out from the International Space Station.");
}

function exitIssMode() {
  if (!issMode) return;
  issMode = false;
  const hud = document.getElementById("iss-hud");
  const exit = document.getElementById("iss-exit");
  if (hud) hud.hidden = true;
  if (exit) exit.hidden = true;
  document.body.classList.remove("iss-mode");
  // Fly back to a nice Earth-view position
  const earthPos = new THREE.Vector3();
  earth.getWorldPosition(earthPos);
  const back = new THREE.Vector3(0, 6, 18).add(earthPos);
  camTween.fromPos.copy(camera.position);
  camTween.toPos.copy(back);
  camTween.fromTarget.copy(controls.target);
  camTween.toTarget.copy(earthPos);
  camTween.t = 0;
  camTween.dur = 1.0;
  camTween.active = true;
  camTween.followObj = null;
  showCaption("Back to space.");
}

// --- caption + state ---
let zoomedOn = null;
let feedMode = false;
const particles = [];

function showCaption(text) {
  captionEl.textContent = text;
  captionEl.classList.add("show");
}
function hideCaption() {
  captionEl.classList.remove("show");
}
function enterFeedMode() {
  feedMode = true;
  showCaption("click anywhere to feed it");
}
function exitFeedMode() {
  feedMode = false;
}

// --- click handling (distinguish drag vs click) ---
let downPos = null;
canvas.addEventListener("pointerdown", (e) => {
  downPos = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener("pointerup", (e) => {
  if (!downPos) return;
  const dx = e.clientX - downPos.x,
    dy = e.clientY - downPos.y;
  const wasDrag = dx * dx + dy * dy > 25;
  downPos = null;
  if (wasDrag) return;

  // In galaxy view a tap on empty space returns home
  if (galaxyGroup.visible) {
    flyHome();
    return;
  }

  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(clickables, false);
  if (hits.length > 0) {
    pickObject(hits[0].object);
  }
});

backBtn.addEventListener("click", () => {
  zoomedOn = null;
  infoToggle.hidden = true;
  infoPanel.hidden = true;
  hideHotspots();
  flyHome();
});

// --- matter particles ---
function spawnMatter(startPos, bhPos) {
  const toBH = new THREE.Vector3().subVectors(bhPos, startPos);
  const dist = toBH.length();
  const dir = toBH.clone().normalize();
  let tangent = new THREE.Vector3().crossVectors(
    dir,
    new THREE.Vector3(0, 1, 0),
  );
  if (tangent.lengthSq() < 0.01) tangent.set(1, 0, 0);
  tangent.normalize();
  const speed = Math.sqrt(900 / Math.max(dist, 5));
  const vel = dir
    .multiplyScalar(speed * 0.25)
    .add(tangent.multiplyScalar(speed * 0.95));

  const color = new THREE.Color().setHSL(Math.random() * 0.12 + 0.04, 1, 0.65);
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 8, 8),
    new THREE.MeshBasicMaterial({ color }),
  );
  mesh.position.copy(startPos);
  scene.add(mesh);

  const trailLen = 50;
  const trailGeo = new THREE.BufferGeometry();
  const trailPositions = new Float32Array(trailLen * 3);
  for (let i = 0; i < trailLen; i++) {
    trailPositions[i * 3] = startPos.x;
    trailPositions[i * 3 + 1] = startPos.y;
    trailPositions[i * 3 + 2] = startPos.z;
  }
  trailGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(trailPositions, 3),
  );
  const trail = new THREE.Line(
    trailGeo,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 }),
  );
  scene.add(trail);

  particles.push({ mesh, vel, trail });
}

const G = 900;
function updateParticles(dt) {
  const bhPos = new THREE.Vector3();
  blackHole.getWorldPosition(bhPos);
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    const r = new THREE.Vector3().subVectors(bhPos, p.mesh.position);
    const dist = Math.max(r.length(), 0.5);
    const accel = r.normalize().multiplyScalar(G / (dist * dist));
    p.vel.add(accel.multiplyScalar(dt));
    p.mesh.position.add(p.vel.clone().multiplyScalar(dt));

    const tp = p.trail.geometry.attributes.position;
    for (let j = tp.count - 1; j > 0; j--) {
      tp.array[j * 3] = tp.array[(j - 1) * 3];
      tp.array[j * 3 + 1] = tp.array[(j - 1) * 3 + 1];
      tp.array[j * 3 + 2] = tp.array[(j - 1) * 3 + 2];
    }
    tp.array[0] = p.mesh.position.x;
    tp.array[1] = p.mesh.position.y;
    tp.array[2] = p.mesh.position.z;
    tp.needsUpdate = true;

    if (dist < eventHorizonRadius * 1.05 || dist > 1500) {
      scene.remove(p.mesh);
      scene.remove(p.trail);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
      p.trail.geometry.dispose();
      p.trail.material.dispose();
      particles.splice(i, 1);
    }
  }
}

// --- animation loop ---
const clock = new THREE.Clock();

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);

  // Galaxy view: slow rotate + pulse "you are here" halo, lock camera in place
  if (galaxyGroup.visible) {
    galaxyGroup.rotation.y += dt * 0.04;
    const halo = galaxyGroup.userData.youHalo;
    if (halo) {
      const t = performance.now() * 0.002;
      const pulse = 1 + Math.sin(t) * 0.18;
      halo.scale.setScalar(80 * pulse);
      halo.material.opacity = 0.22 + (Math.sin(t) + 1) * 0.1;
    }
    if (!camTween.active) {
      camera.position.copy(galaxyPos);
      controls.target.copy(galaxyTarget);
      camera.lookAt(galaxyTarget);
    }
  }

  for (const p of planetPivots) p.pivot.rotation.y += dt * p.speed;
  for (const m of moons) m.pivot.rotation.y += dt * m.speed;

  // Earth low-orbit scene: only show + animate when camera is close to Earth
  const earthWorld = new THREE.Vector3();
  earth.getWorldPosition(earthWorld);
  const dEarth = camera.position.distanceTo(earthWorld);
  const earthCloseUp = dEarth < 30;
  earthOrbital.visible = earthCloseUp || issMode;
  if (earthCloseUp || issMode) {
    for (const s of satellites) s.pivot.rotation.y += dt * s.speed;
    if (earthCloseUp) updateRocket(dt);
  }
  // Astronaut view: snap camera to the ISS each frame, look back at Earth
  if (issMode && issSatRef) {
    const issPos = new THREE.Vector3();
    issSatRef.sat.getWorldPosition(issPos);
    // Offset camera slightly outward (away from Earth) so we feel like we're
    // looking out a window, not stuck inside the bus
    const outward = new THREE.Vector3().subVectors(issPos, earthWorld).normalize();
    const camPos = issPos.clone().add(outward.multiplyScalar(0.35));
    camera.position.copy(camPos);
    controls.target.copy(earthWorld);
    camera.lookAt(earthWorld);
  }
  // Show / hide launch button when zoomed on Earth
  if (zoomedOn === earth && earthCloseUp && !issMode) {
    if (launchBtn.hidden) launchBtn.hidden = false;
  } else if (!launchBtn.hidden) {
    launchBtn.hidden = true;
  }
  asteroidBelt.rotation.y += dt * 0.006;
  kuiperBelt.rotation.y += dt * 0.001;
  sun.rotation.y += dt * 0.05;
  disc.rotation.z += dt * 0.25;
  photonRing.rotation.z += dt * 0.05;

  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(clickables, false);
  if (hits.length > 0 && !feedMode) {
    const o = hits[0].object;
    if (hovered !== o) {
      hovered = o;
      hoverLabel.textContent = o.userData.name;
      hoverLabel.classList.add("show");
      document.body.classList.add("pointing");
    }
  } else if (hovered) {
    hovered = null;
    hoverLabel.classList.remove("show");
    document.body.classList.remove("pointing");
  }

  if (camTween.active) {
    camTween.t += dt / camTween.dur;
    const k = Math.min(camTween.t, 1);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    // If following something that's moving, retarget the tween end to its current world pos
    if (camTween.followObj) {
      const liveTarget = new THREE.Vector3();
      camTween.followObj.getWorldPosition(liveTarget);
      const dir = new THREE.Vector3().subVectors(
        camTween.toPos,
        camTween.toTarget,
      );
      camTween.toTarget.copy(liveTarget);
      camTween.toPos.copy(liveTarget).add(dir);
    }
    camera.position.lerpVectors(camTween.fromPos, camTween.toPos, e);
    controls.target.lerpVectors(camTween.fromTarget, camTween.toTarget, e);
    if (k >= 1) {
      camTween.active = false;
      if (!galaxyGroup.visible) controls.enabled = true;
      // Begin following
      if (camTween.followObj) {
        followObj = camTween.followObj;
        followObj.getWorldPosition(lastFollowPos);
      }
    }
  }

  // Follow moving objects: translate camera + target together
  if (followObj && !camTween.active) {
    const wp = new THREE.Vector3();
    followObj.getWorldPosition(wp);
    const delta = wp.clone().sub(lastFollowPos);
    camera.position.add(delta);
    controls.target.add(delta);
    lastFollowPos.copy(wp);
  }

  updateParticles(dt);
  controls.update();

  // Update lensing shader: project black hole to screen + measure horizon radius in px
  {
    const bhWorld = new THREE.Vector3();
    blackHole.getWorldPosition(bhWorld);
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    const toBH = new THREE.Vector3().subVectors(bhWorld, camera.position);
    const inFront = toBH.dot(camDir) > 0;

    // Orient the jet so its axis points from the black hole straight at the camera.
    // blackHoleGroup has no rotation, so world dir == local dir for jetGroup.
    const toCam = new THREE.Vector3()
      .subVectors(camera.position, bhWorld)
      .normalize();
    jetGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), toCam);

    if (inFront) {
      const bhClip = bhWorld.clone().project(camera);
      // Measure horizon radius in pixels by projecting an offset on screen-right axis
      const right = new THREE.Vector3()
        .crossVectors(camDir, camera.up)
        .normalize();
      const edge = bhWorld
        .clone()
        .add(right.multiplyScalar(eventHorizonRadius))
        .project(camera);
      const w = renderer.domElement.width / renderer.getPixelRatio();
      const h = renderer.domElement.height / renderer.getPixelRatio();
      const dx = (edge.x - bhClip.x) * 0.5 * w;
      const dy = (edge.y - bhClip.y) * 0.5 * h;
      const horizonPx = Math.sqrt(dx * dx + dy * dy);

      lensPass.uniforms.uBH.value.set(bhClip.x, bhClip.y);
      lensPass.uniforms.uHorizonPx.value = horizonPx;
      lensPass.uniforms.uActive.value = 1;
    } else {
      lensPass.uniforms.uActive.value = 0;
    }
  }

  composer.render();
  updateHotspots();
  requestAnimationFrame(animate);
}
animate();

setTimeout(() => hint.classList.add("fade"), 6000);

// --- on-screen zoom controls ---
const zoomInBtn = document.getElementById("zoom-in");
const zoomOutBtn = document.getElementById("zoom-out");
const recenterBtn = document.getElementById("recenter");

function zoom(factor) {
  const offset = new THREE.Vector3().subVectors(
    camera.position,
    controls.target,
  );
  offset.multiplyScalar(factor);
  const newDist = offset.length();
  if (newDist < controls.minDistance || newDist > controls.maxDistance) return;
  camera.position.copy(controls.target).add(offset);
  controls.update();
}
zoomInBtn.addEventListener("click", () => zoom(0.7));
zoomOutBtn.addEventListener("click", () => zoom(1.4));
recenterBtn.addEventListener("click", () => {
  // Full reset to initial view
  camTween.fromPos.copy(camera.position);
  camTween.fromTarget.copy(controls.target);
  camTween.toTarget.set(0, 0, 0);
  camTween.toPos.copy(homePos);
  camTween.t = 0;
  camTween.dur = 0.9;
  camTween.active = true;
  controls.enabled = false;
  followObj = null;
  zoomedOn = null;
  infoToggle.hidden = true;
  infoPanel.hidden = true;
  backBtn.hidden = true;
  hideHotspots();
});

const homeBtn = document.getElementById("home-btn");
if (homeBtn) {
  homeBtn.addEventListener("click", () => {
    recenterBtn.click();
    showIntro();
  });
}

// --- search (grouped, with working close) ---
const searchToggle = document.getElementById("search-toggle");
const searchPanel = document.getElementById("search-panel");
const searchInput = document.getElementById("search-input");
const searchResults = document.getElementById("search-results");
const searchClose = document.getElementById("search-close");

function pickObject(obj) {
  zoomedOn = obj;
  flyTo(obj);
  showCaption(obj.userData.caption);
  backBtn.hidden = false;
  hint.classList.add("fade");
  if (obj.userData.details) {
    infoToggle.hidden = false;
    openInfo();
  } else {
    infoToggle.hidden = true;
    infoPanel.hidden = true;
  }
  // Hotspots are hidden by default — user reveals them via the Explore button
  if (obj.userData.isBlackHole) {
    setTimeout(() => {
      if (zoomedOn === obj) enterFeedMode();
    }, 1700);
  }
}

const infoToggle = document.getElementById("info-toggle");
const infoPanel = document.getElementById("info-panel");
const infoTitle = document.getElementById("info-title");
const infoBody = document.getElementById("info-body");
const infoClose = document.getElementById("info-close");

// =================== QUIZ ===================
const QUIZZES = {
  Sun: [
    {
      q: "What is the Sun mostly made of?",
      choices: [
        "Iron and rock",
        "Hydrogen and helium",
        "Water and ice",
        "Lava",
      ],
      answer: 1,
      why: "The Sun is about 73% hydrogen and 25% helium, the rest is everything else.",
    },
    {
      q: "How long does sunlight take to reach Earth?",
      choices: ["Instantly", "About 8 minutes", "About 1 hour", "A whole day"],
      answer: 1,
      why: "Light from the Sun travels for about 8 minutes and 20 seconds before it reaches us.",
    },
    {
      q: "What kind of star is our Sun?",
      choices: [
        "A giant red star",
        "A neutron star",
        "A medium yellow dwarf",
        "A blue supergiant",
      ],
      answer: 2,
      why: "It\u2019s a G-type main-sequence star, a yellow dwarf, kind of medium-sized.",
    },
    {
      q: "Roughly how old is the Sun?",
      choices: [
        "1,000 years",
        "1 million years",
        "4.6 billion years",
        "100 billion years",
      ],
      answer: 2,
      why: "About 4.6 billion years, and it\u2019s only about halfway through its life.",
    },
    {
      q: "How hot is the Sun\u2019s surface?",
      choices: [
        "About 100°C",
        "About 1,000°C",
        "About 5,500°C",
        "About 1 million°C",
      ],
      answer: 2,
      why: "The visible surface (the photosphere) is about 5,500°C. The core is way hotter, 15 million°C.",
    },
    {
      q: "What process makes the Sun shine?",
      choices: ["Burning wood", "Nuclear fusion of hydrogen", "Solar panels"],
      answer: 1,
      why: "Hydrogen atoms fuse into helium in the Sun\u2019s core, releasing huge amounts of energy.",
    },
    {
      q: "How many Earths could fit inside the Sun?",
      choices: [
        "About 10",
        "About 1,000",
        "About 1.3 million",
        "About 1 trillion",
      ],
      answer: 2,
      why: "About 1.3 million Earths could fit inside the Sun. It\u2019s enormous.",
    },
    {
      q: "What will the Sun become in about 5 billion years?",
      choices: [
        "A black hole",
        "A red giant, then a white dwarf",
        "A new planet",
      ],
      answer: 1,
      why: "It\u2019ll swell into a red giant (probably swallowing Mercury and Venus), then shed its outer layers and shrink to a tiny white dwarf.",
    },
    {
      q: "What is the Sun\u2019s outer atmosphere called?",
      choices: ["Photosphere", "Corona", "Ionosphere"],
      answer: 1,
      why: "The corona is the wispy outer atmosphere we see during a total solar eclipse.",
    },
    {
      q: "What are sunspots?",
      choices: [
        "Holes in the Sun",
        "Cooler patches caused by magnetic activity",
        "Comet impacts",
      ],
      answer: 1,
      why: "Sunspots are slightly cooler regions where strong magnetic fields slow heat from rising.",
    },
  ],
  Mercury: [
    {
      q: "How many moons does Mercury have?",
      choices: ["0", "1", "2", "5"],
      answer: 0,
      why: "Mercury has no moons at all.",
    },
    {
      q: "Mercury is the closest planet to the Sun. Is it the hottest?",
      choices: ["Yes, it\u2019s baking", "No, Venus is hotter"],
      answer: 1,
      why: "Venus is hotter because its thick atmosphere traps heat. Mercury has almost none.",
    },
    {
      q: "What does Mercury\u2019s surface look like?",
      choices: [
        "Oceans and beaches",
        "Forest and rivers",
        "Cratered rock, like the Moon",
        "Smooth ice",
      ],
      answer: 2,
      why: "Mercury looks a lot like our Moon, gray, cratered, no atmosphere.",
    },
    {
      q: "How long is one year on Mercury?",
      choices: ["88 Earth days", "1 Earth year", "12 Earth years"],
      answer: 0,
      why: "Mercury zips around the Sun in just 88 days, the fastest planet.",
    },
    {
      q: "How big is Mercury compared to Earth\u2019s Moon?",
      choices: [
        "Way smaller than the Moon",
        "Just a bit bigger than the Moon",
        "Twice as big as Earth",
      ],
      answer: 1,
      why: "Mercury is only slightly larger than our Moon, the smallest planet.",
    },
    {
      q: "How extreme are Mercury\u2019s temperatures?",
      choices: [
        "Always around 20°C",
        "Day +430°C, night −180°C",
        "Always freezing cold",
      ],
      answer: 1,
      why: "With no atmosphere to hold heat, Mercury swings from scorching day to icy night.",
    },
    {
      q: "What\u2019s the biggest crater on Mercury called?",
      choices: ["Caloris Basin", "Olympus Mons", "Tycho"],
      answer: 0,
      why: "The Caloris Basin is about 1,550 km wide, made by a giant asteroid impact.",
    },
    {
      q: "Is there ice on Mercury?",
      choices: [
        "No way, it\u2019s too hot",
        "Yes, frozen at the poles in deep craters",
        "Only on the night side",
      ],
      answer: 1,
      why: "Permanently shadowed crater floors near the poles never see the Sun and hold water ice.",
    },
    {
      q: "How many spacecraft have orbited Mercury?",
      choices: ["None", "Just one (MESSENGER)", "Dozens"],
      answer: 1,
      why: "NASA\u2019s MESSENGER orbited Mercury from 2011 to 2015. BepiColombo is on its way too.",
    },
  ],
  Venus: [
    {
      q: "Why is Venus the hottest planet?",
      choices: [
        "It\u2019s closest to the Sun",
        "Its thick clouds trap heat",
        "It\u2019s on fire",
      ],
      answer: 1,
      why: "A runaway greenhouse effect, its CO\u2082 atmosphere holds in the Sun\u2019s heat.",
    },
    {
      q: "Venus spins in which direction compared to most planets?",
      choices: ["The same way", "Backwards"],
      answer: 1,
      why: "On Venus, the Sun would rise in the west and set in the east.",
    },
    {
      q: "A day on Venus (one rotation) is...",
      choices: ["Shorter than its year", "Longer than its year"],
      answer: 1,
      why: "Venus rotates so slowly that one day there is longer than one Venusian year!",
    },
    {
      q: "What is Venus often called?",
      choices: ["Earth\u2019s twin", "The red planet", "The ringed planet"],
      answer: 0,
      why: "Venus and Earth are similar in size, mass and density, but Venus is a much harsher place.",
    },
    {
      q: "What rains down on Venus?",
      choices: ["Water", "Sulfuric acid", "Diamonds"],
      answer: 1,
      why: "Venus has clouds and rain made of sulfuric acid, though the rain evaporates before hitting the ground.",
    },
    {
      q: "How hot is Venus\u2019 surface?",
      choices: ["About 50°C", "About 200°C", "About 465°C"],
      answer: 2,
      why: "About 465°C, hot enough to melt lead.",
    },
    {
      q: "How is the air pressure on Venus?",
      choices: [
        "Same as Earth",
        "90 times Earth\u2019s, like being deep underwater",
        "Almost no atmosphere",
      ],
      answer: 1,
      why: "Standing on Venus would feel like being 900 m underwater on Earth.",
    },
    {
      q: "How many moons does Venus have?",
      choices: ["0", "1", "2"],
      answer: 0,
      why: "Zero, Venus and Mercury are the only planets with no moons.",
    },
    {
      q: "What time of day is Venus often visible from Earth?",
      choices: [
        "Only at midnight",
        "Just after sunset or before sunrise",
        "Only during eclipses",
      ],
      answer: 1,
      why: 'It\u2019s called the "evening star" or "morning star" because that\u2019s when it shines brightest.',
    },
  ],
  Earth: [
    {
      q: "What percent of Earth is covered by water?",
      choices: ["About 30%", "About 50%", "About 71%", "About 95%"],
      answer: 2,
      why: "About 71%, that\u2019s why it looks so blue from space.",
    },
    {
      q: "Why does Earth have seasons?",
      choices: [
        "Distance from the Sun changes",
        "Earth is tilted on its axis",
        "The Sun gets brighter",
      ],
      answer: 1,
      why: "Earth\u2019s 23.5° tilt is what gives us summer and winter.",
    },
    {
      q: "How old is the Earth, roughly?",
      choices: [
        "6,000 years",
        "1 million years",
        "4.5 billion years",
        "14 billion years",
      ],
      answer: 2,
      why: "About 4.54 billion years, our Sun and planets formed together.",
    },
    {
      q: "What protects Earth\u2019s surface from harmful solar radiation?",
      choices: ["The Moon", "The atmosphere and magnetic field", "Clouds"],
      answer: 1,
      why: "Earth\u2019s magnetic field deflects solar wind, and the atmosphere absorbs UV.",
    },
    {
      q: "How fast does the Earth spin at the equator?",
      choices: ["About 100 km/h", "About 1,670 km/h", "About 100,000 km/h"],
      answer: 1,
      why: "About 1,670 km/h, but you don\u2019t feel it because everything spins together.",
    },
    {
      q: "What is Earth\u2019s only natural satellite?",
      choices: ["Phobos", "The Moon", "Titan"],
      answer: 1,
      why: "The Moon, about 384,400 km away.",
    },
    {
      q: "Where is most of Earth\u2019s fresh water locked up?",
      choices: ["In rivers", "In ice caps and glaciers", "In clouds"],
      answer: 1,
      why: "About 68% of Earth\u2019s fresh water is frozen in ice caps and glaciers.",
    },
    {
      q: "What is Earth\u2019s atmosphere mostly made of?",
      choices: [
        "Oxygen",
        "Nitrogen (~78%) and oxygen (~21%)",
        "Carbon dioxide",
      ],
      answer: 1,
      why: "Mostly nitrogen, then oxygen, with tiny amounts of argon, CO\u2082 and other gases.",
    },
    {
      q: "How many continents does Earth have?",
      choices: ["5", "7", "10"],
      answer: 1,
      why: "Seven: Africa, Antarctica, Asia, Australia, Europe, North America, South America.",
    },
  ],
  Moon: [
    {
      q: "How did the Moon probably form?",
      choices: [
        "It was always there",
        "It was captured by Earth\u2019s gravity",
        "A Mars-sized object hit Earth and the debris formed it",
      ],
      answer: 2,
      why: 'The "giant impact" theory, a young Earth was smashed and the debris clumped together.',
    },
    {
      q: "How many people have walked on the Moon?",
      choices: ["Nobody", "1", "12", "50"],
      answer: 2,
      why: "12 astronauts walked on the Moon between 1969 and 1972.",
    },
    {
      q: "Why do we always see the same face of the Moon?",
      choices: [
        "It doesn\u2019t spin",
        "It spins exactly as fast as it orbits",
        "Earth\u2019s atmosphere blocks the back",
      ],
      answer: 1,
      why: 'It\u2019s "tidally locked", its rotation matches its orbit perfectly.',
    },
    {
      q: "What causes ocean tides on Earth?",
      choices: [
        "Wind",
        "The Moon\u2019s gravity (and the Sun\u2019s)",
        "Fish moving around",
      ],
      answer: 1,
      why: "The Moon\u2019s gravity pulls on Earth\u2019s oceans, creating tides.",
    },
    {
      q: "How long does the Moon take to orbit Earth?",
      choices: ["1 day", "About 27 days", "1 year"],
      answer: 1,
      why: "About 27.3 days, almost the same as one calendar month.",
    },
    {
      q: "How is the Moon changing over time?",
      choices: [
        "Getting closer to Earth",
        "Drifting away by ~3.8 cm a year",
        "Staying exactly put",
      ],
      answer: 1,
      why: "It\u2019s drifting away, about as fast as your fingernails grow.",
    },
    {
      q: "Why are the Moon\u2019s footprints still there from 1969?",
      choices: [
        "Special rubber boots",
        "No wind or weather to erase them",
        "Astronauts went back to repaint them",
      ],
      answer: 1,
      why: "No atmosphere = no wind, no rain. Footprints can last millions of years.",
    },
    {
      q: "Who was the first person to walk on the Moon?",
      choices: ["Buzz Aldrin", "Neil Armstrong", "Yuri Gagarin"],
      answer: 1,
      why: "Neil Armstrong, on July 20, 1969, followed minutes later by Buzz Aldrin.",
    },
    {
      q: "About how far away is the Moon?",
      choices: ["About 38,000 km", "About 384,000 km", "About 38 million km"],
      answer: 1,
      why: "Roughly 384,400 km, about 30 Earths could fit between us and the Moon.",
    },
  ],
  Mars: [
    {
      q: "Why is Mars red?",
      choices: [
        "It\u2019s on fire",
        "Iron in the dirt has rusted",
        "Red plants grow there",
      ],
      answer: 1,
      why: "Iron oxide, rust, covers Mars\u2019 surface.",
    },
    {
      q: "How many moons does Mars have?",
      choices: ["0", "1", "2", "95"],
      answer: 2,
      why: "Phobos and Deimos, both small, lumpy and potato-shaped.",
    },
    {
      q: "What is the biggest volcano in the solar system?",
      choices: ["Mauna Loa on Earth", "Olympus Mons on Mars", "Loki on Io"],
      answer: 1,
      why: "Olympus Mons is about 22 km tall, almost 3 times taller than Mount Everest.",
    },
    {
      q: "How long is one Mars day?",
      choices: ["About 24 hours 37 min", "About 6 hours", "About 2 weeks"],
      answer: 0,
      why: 'A Mars day (a "sol") is just a bit longer than an Earth day.',
    },
    {
      q: "Did Mars ever have liquid water on its surface?",
      choices: [
        "Never",
        "Yes, billions of years ago",
        "Yes, right now in oceans",
      ],
      answer: 1,
      why: "Ancient riverbeds and lake floors show Mars once had flowing water.",
    },
    {
      q: "What\u2019s the biggest canyon in the solar system?",
      choices: [
        "Grand Canyon (Earth)",
        "Valles Marineris (Mars)",
        "Verona Rupes (Miranda)",
      ],
      answer: 1,
      why: "Valles Marineris is about 4,000 km long, it would stretch across the whole USA.",
    },
    {
      q: "What gives Mars its thin pinkish sky during the day?",
      choices: [
        "Lots of oxygen",
        "Dust in the atmosphere",
        "Nothing, it\u2019s blue like Earth",
      ],
      answer: 1,
      why: "Iron-rich dust suspended in the thin atmosphere tints the sky pink.",
    },
    {
      q: "Which rover has been exploring Mars since 2021?",
      choices: ["Curiosity", "Perseverance", "Spirit"],
      answer: 1,
      why: "Perseverance landed on Mars in February 2021 and is still exploring.",
    },
    {
      q: "How long does it take to travel from Earth to Mars?",
      choices: ["A few hours", "About 7 months", "About 10 years"],
      answer: 1,
      why: "Most missions take 6-9 months, depending on the orbits.",
    },
  ],
  Jupiter: [
    {
      q: "What is the Great Red Spot?",
      choices: ["A volcano", "A giant storm bigger than Earth", "A continent"],
      answer: 1,
      why: "A storm that\u2019s been raging for at least 350 years.",
    },
    {
      q: "How many moons does Jupiter have?",
      choices: ["No moons", "1 moon", "4 moons", "95+ moons"],
      answer: 3,
      why: "At least 95 known moons, the four biggest are called the Galilean moons.",
    },
    {
      q: "What is Jupiter mostly made of?",
      choices: ["Rock and metal", "Hydrogen and helium gas", "Ice and water"],
      answer: 1,
      why: "It\u2019s a gas giant, mostly hydrogen and helium, like a tiny failed star.",
    },
    {
      q: "How long is one day on Jupiter?",
      choices: ["About 10 hours", "About 24 hours", "About a week"],
      answer: 0,
      why: "Jupiter spins faster than any other planet, one day is just under 10 hours.",
    },
    {
      q: "Who first spotted Jupiter\u2019s four big moons?",
      choices: ["Newton", "Galileo in 1610", "NASA in 1990"],
      answer: 1,
      why: "Galileo Galilei spotted Io, Europa, Ganymede and Callisto with a tiny telescope.",
    },
    {
      q: "How big is Jupiter compared to Earth?",
      choices: ["Same size", "About 11× wider", "About 100× wider"],
      answer: 1,
      why: "Jupiter is about 11 times wider than Earth, and you could fit 1,300 Earths inside it.",
    },
    {
      q: "Which Jupiter moon is the most volcanic place in the solar system?",
      choices: ["Europa", "Io", "Callisto"],
      answer: 1,
      why: "Io has hundreds of active volcanoes thanks to Jupiter\u2019s tidal squeezing.",
    },
    {
      q: "Which Jupiter moon might have a hidden ocean of liquid water?",
      choices: ["Io", "Europa", "Callisto"],
      answer: 1,
      why: "Europa\u2019s icy crust is thought to hide a salty ocean, maybe twice the water of all Earth\u2019s oceans combined.",
    },
    {
      q: "Does Jupiter have rings?",
      choices: [
        "No, only Saturn does",
        "Yes, but they\u2019re very faint and dusty",
      ],
      answer: 1,
      why: "Jupiter has thin, dusty rings made of debris kicked up from its small inner moons.",
    },
  ],
  Saturn: [
    {
      q: "What are Saturn\u2019s rings mostly made of?",
      choices: ["Rock", "Chunks of ice", "Gas", "Plastic"],
      answer: 1,
      why: "Mostly water ice, with some rocky bits, chunks ranging from grains to mountains.",
    },
    {
      q: "How thick are Saturn\u2019s rings (typically)?",
      choices: ["Thinner than 1 km", "About 100 km", "About 1,000 km"],
      answer: 0,
      why: "They\u2019re HUGE across (280,000 km wide) but usually less than 1 km thick, like a giant flat pancake.",
    },
    {
      q: "Saturn\u2019s biggest moon, Titan, has...",
      choices: [
        "No atmosphere",
        "A thick atmosphere with methane lakes",
        "Active volcanoes of lava",
      ],
      answer: 1,
      why: "Titan is the only moon with a thick atmosphere, and it has rivers and lakes of liquid methane!",
    },
    {
      q: "Which moon shoots water geysers from its south pole?",
      choices: ["Mimas", "Enceladus", "Titan"],
      answer: 1,
      why: "Enceladus has a hidden ocean and shoots water plumes hundreds of km into space.",
    },
    {
      q: "Could Saturn float on water (in a giant bathtub)?",
      choices: [
        "Yes, it\u2019s less dense than water",
        "No, it would sink instantly",
      ],
      answer: 0,
      why: "Saturn is less dense than water, so in theory yes! It\u2019s the only planet that would.",
    },
    {
      q: "How many known moons does Saturn have?",
      choices: ["1", "27", "146+"],
      answer: 2,
      why: "At least 146, the most of any planet in the solar system.",
    },
    {
      q: "Saturn\u2019s moon Mimas looks like what famous movie object?",
      choices: ["The Death Star", "A spaceship", "A pyramid"],
      answer: 0,
      why: "Mimas has one giant crater (Herschel) that makes it look like the Death Star.",
    },
    {
      q: "What\u2019s the gap in Saturn\u2019s rings called?",
      choices: ["Cassini Division", "Hubble Gap", "Galileo Strip"],
      answer: 0,
      why: "The Cassini Division is a 4,800 km gap between Saturn\u2019s A and B rings.",
    },
    {
      q: "How long does Saturn take to orbit the Sun?",
      choices: ["1 year", "About 29 Earth years", "100 Earth years"],
      answer: 1,
      why: "Saturn takes about 29.5 Earth years to complete one orbit.",
    },
  ],
  Uranus: [
    {
      q: "What\u2019s weird about how Uranus spins?",
      choices: [
        "It doesn\u2019t spin",
        "It spins backwards super fast",
        "It\u2019s tipped on its side",
      ],
      answer: 2,
      why: "Uranus rotates almost on its side, probably knocked over by a giant impact long ago.",
    },
    {
      q: "What gives Uranus its blue-green color?",
      choices: ["Oceans", "Methane in the atmosphere", "Plants"],
      answer: 1,
      why: "Methane absorbs red light and reflects the blue-green back at us.",
    },
    {
      q: "Uranus\u2019 moons are mostly named after characters from...",
      choices: ["Greek myths", "Shakespeare and Pope", "Egyptian gods"],
      answer: 1,
      why: "Titania, Oberon, Puck, Miranda, Ariel, all from Shakespeare and Alexander Pope.",
    },
    {
      q: "How many known moons does Uranus have?",
      choices: ["1", "5", "27", "146"],
      answer: 2,
      why: "About 27 known moons.",
    },
    {
      q: "How long is a season on Uranus?",
      choices: ["3 months", "1 year", "About 21 Earth years"],
      answer: 2,
      why: "Uranus takes 84 Earth years to orbit the Sun, so each pole gets ~42 years of darkness then 42 of light.",
    },
    {
      q: "What is Uranus\u2019 atmosphere mostly made of?",
      choices: [
        "Nitrogen and oxygen",
        "Hydrogen, helium and methane",
        "Carbon dioxide",
      ],
      answer: 1,
      why: "Hydrogen and helium with a little methane (which makes it blue-green).",
    },
    {
      q: "Does Uranus have rings?",
      choices: ["No", "Yes, 13 narrow dark rings"],
      answer: 1,
      why: "Uranus has 13 thin, dark rings, much fainter than Saturn\u2019s.",
    },
    {
      q: "Who discovered Uranus?",
      choices: ["Galileo", "William Herschel in 1781", "NASA in the 1970s"],
      answer: 1,
      why: "William Herschel spotted it in 1781, the first planet discovered with a telescope.",
    },
    {
      q: "How cold can Uranus get?",
      choices: ["Around 0°C", "About −224°C, coldest of all planets", "500°C"],
      answer: 1,
      why: "Uranus has the coldest atmosphere of any planet, getting down to about −224°C.",
    },
  ],
  Neptune: [
    {
      q: "What\u2019s the wind speed in Neptune\u2019s storms?",
      choices: ["About 100 km/h", "About 500 km/h", "Up to 2,000 km/h"],
      answer: 2,
      why: "Neptune has the fastest winds in the solar system, over 2,000 km/h.",
    },
    {
      q: "Neptune\u2019s biggest moon, Triton, does something unusual. What?",
      choices: [
        "Glows in the dark",
        "Orbits backwards",
        "Splits in half daily",
      ],
      answer: 1,
      why: "Triton orbits backwards, it was probably a Kuiper-belt object Neptune captured.",
    },
    {
      q: "How was Neptune discovered?",
      choices: [
        "By accident",
        "Predicted with math, then spotted",
        "Found by an alien",
      ],
      answer: 1,
      why: "Astronomers noticed Uranus\u2019 orbit was off, did the math, and pointed a telescope where Neptune should be, and it was there!",
    },
    {
      q: "How long does Neptune take to orbit the Sun?",
      choices: ["1 year", "12 years", "About 165 Earth years"],
      answer: 2,
      why: "Since its discovery in 1846, it has only completed one orbit (in 2011).",
    },
    {
      q: "How far is Neptune from the Sun, on average?",
      choices: [
        "Same as Earth",
        "About 4.5 billion km, 30× Earth\u2019s distance",
        "About 100 light-years",
      ],
      answer: 1,
      why: "About 4.5 billion km, sunlight takes more than 4 hours to get there.",
    },
    {
      q: "What gives Neptune its bright blue color?",
      choices: [
        "Oceans",
        "Methane absorbing red light",
        "Reflection from Earth",
      ],
      answer: 1,
      why: "Methane in its atmosphere absorbs red light, making it look deep blue.",
    },
    {
      q: "Has any spacecraft visited Neptune?",
      choices: ["Many", "Just one, Voyager 2 in 1989", "Never"],
      answer: 1,
      why: "Only Voyager 2 has flown by Neptune, back in 1989.",
    },
    {
      q: "Does Neptune have rings?",
      choices: ["No", "Yes, 5 faint rings"],
      answer: 1,
      why: "Neptune has 5 dark, dusty rings discovered when Voyager 2 flew by.",
    },
    {
      q: 'What\u2019s Neptune\u2019s "Great Dark Spot"?',
      choices: ["A continent", "A giant storm system", "An impact crater"],
      answer: 1,
      why: "A massive storm in Neptune\u2019s atmosphere, similar to Jupiter\u2019s Red Spot but they come and go.",
    },
  ],
  Pluto: [
    {
      q: "Pluto used to be called the 9th planet. What is it now?",
      choices: ["A moon", "A dwarf planet", "A comet"],
      answer: 1,
      why: "In 2006 it was reclassified as a dwarf planet.",
    },
    {
      q: "Pluto\u2019s biggest moon, Charon, is...",
      choices: [
        "Tiny compared to Pluto",
        "About half Pluto\u2019s size",
        "Bigger than Pluto",
      ],
      answer: 1,
      why: "Charon is so big they almost orbit each other, like a double dwarf-planet.",
    },
    {
      q: "What is on Pluto\u2019s surface?",
      choices: [
        "Hot deserts",
        "Mountains of ice and a heart-shaped plain",
        "Lava",
      ],
      answer: 1,
      why: "Pluto has water-ice mountains and a famous heart-shaped nitrogen-ice plain called Tombaugh Regio.",
    },
    {
      q: "How many moons does Pluto have?",
      choices: ["0", "1", "5"],
      answer: 2,
      why: "Five: Charon, Nix, Hydra, Kerberos and Styx.",
    },
    {
      q: "Which spacecraft visited Pluto?",
      choices: ["Voyager 1", "New Horizons in 2015", "Apollo 11"],
      answer: 1,
      why: "New Horizons flew by Pluto in July 2015 and gave us the first close-up photos.",
    },
    {
      q: "How long is a year on Pluto?",
      choices: ["1 Earth year", "About 248 Earth years", "1,000 Earth years"],
      answer: 1,
      why: "Pluto takes about 248 Earth years to orbit the Sun, once.",
    },
    {
      q: "Why is Pluto no longer a planet?",
      choices: [
        "It got smaller",
        "It hasn\u2019t cleared its orbit of other objects",
        "It moved away",
      ],
      answer: 1,
      why: 'A "planet" must clear out other objects in its orbit. Pluto shares its zone with lots of Kuiper-belt objects.',
    },
    {
      q: "Who discovered Pluto?",
      choices: ["Galileo", "Clyde Tombaugh in 1930", "NASA in 2006"],
      answer: 1,
      why: "Clyde Tombaugh spotted Pluto in 1930 from an observatory in Arizona.",
    },
    {
      q: "How big is Pluto compared to Earth\u2019s Moon?",
      choices: ["Bigger than the Moon", "Smaller than the Moon", "Same size"],
      answer: 1,
      why: "Pluto is smaller than our Moon, about 2,377 km wide.",
    },
  ],
  "Black hole": [
    {
      q: "What can\u2019t escape a black hole?",
      choices: ["Sound", "Light", "Magnets"],
      answer: 1,
      why: "Not even light is fast enough to escape past the event horizon.",
    },
    {
      q: 'What is the "event horizon"?',
      choices: [
        "A weather forecast",
        "The point of no return around a black hole",
        "A type of telescope",
      ],
      answer: 1,
      why: "Cross the event horizon and you can never come back, gravity is too strong.",
    },
    {
      q: "If you fell into a black hole feet-first, what would happen?",
      choices: [
        "Nothing, you\u2019d be fine",
        "You\u2019d be stretched into a long noodle",
        "You\u2019d bounce out",
      ],
      answer: 1,
      why: "Scientists call it spaghettification, gravity pulls your feet way harder than your head.",
    },
    {
      q: "How do most black holes form?",
      choices: [
        "When a giant star runs out of fuel and collapses",
        "When two planets collide",
        "They\u2019re built by aliens",
      ],
      answer: 0,
      why: "When a star much bigger than the Sun dies, its core can collapse into a black hole.",
    },
    {
      q: "What\u2019s at the center of most large galaxies?",
      choices: [
        "A bright blue star",
        "A supermassive black hole",
        "Empty space",
      ],
      answer: 1,
      why: "Most big galaxies, including our Milky Way, have a supermassive black hole at their core.",
    },
    {
      q: "What\u2019s the supermassive black hole at the centre of our galaxy called?",
      choices: ["Cygnus X-1", "Sagittarius A*", "TON 618"],
      answer: 1,
      why: 'Sagittarius A* (pronounced "A-star") is about 4 million times the mass of the Sun.',
    },
    {
      q: "What is the swirling disc of glowing matter around a black hole called?",
      choices: ["Photon ring", "Accretion disc", "Solar flare"],
      answer: 1,
      why: "The accretion disc is gas and dust spiralling in, it gets so hot it glows brightly.",
    },
    {
      q: "What happens to time near a black hole (from far away)?",
      choices: ["Speeds up", "Stays the same", "Slows down"],
      answer: 2,
      why: "Strong gravity slows time. From far away, a clock near a black hole would tick really slowly.",
    },
    {
      q: "When was the first photo of a black hole taken?",
      choices: ["1969", "2019 (M87*)", "2050"],
      answer: 1,
      why: "The Event Horizon Telescope released the first image of M87* in 2019.",
    },
    {
      q: "Who first predicted black holes mathematically?",
      choices: [
        "Newton",
        "Einstein\u2019s general relativity (1915)",
        "Hawking in 1990",
      ],
      answer: 1,
      why: "They came out of Einstein\u2019s 1915 theory, though he didn\u2019t fully believe they\u2019d really exist.",
    },
  ],
};

const QUIZ_LENGTH = 7;

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Quiz UI
const quizOverlay = document.getElementById("quiz-overlay");
const quizClose = document.getElementById("quiz-close");
const quizTitle = document.getElementById("quiz-title");
const quizBody = document.getElementById("quiz-body");
const quizProgressFill = document.getElementById("quiz-progress-fill");

let quizState = null;

function openQuiz(name) {
  const pool = QUIZZES[name];
  if (!pool || !pool.length) return;
  // Pick QUIZ_LENGTH random questions (or all of them, if pool is smaller)
  const picked = shuffle(pool).slice(0, Math.min(QUIZ_LENGTH, pool.length));
  // Shuffle each question's choices, remap the answer index
  const questions = picked.map((q) => {
    const order = shuffle(q.choices.map((_, i) => i));
    return {
      q: q.q,
      choices: order.map((i) => q.choices[i]),
      answer: order.indexOf(q.answer),
      why: q.why,
    };
  });
  quizState = { name, questions, idx: 0, score: 0, answered: false, started: false };
  quizTitle.textContent = `${name} quiz`;
  quizOverlay.hidden = false;
  renderQuizSplash();
}

function renderQuizSplash() {
  const s = quizState;
  if (!s) return;
  quizProgressFill.style.width = "0%";
  const total = s.questions.length;
  const palette = QUIZ_PALETTE[s.name] || QUIZ_PALETTE.default;
  quizOverlay.classList.add("is-intro");
  const planetClass = `qs-planet ${PLANET_FEATURE_CLASS[s.name] || ""}`.trim();
  const titleLetters = s.name
    .split("")
    .map((ch, i) => `<span class="ql" style="--i:${i}">${ch === " " ? "&nbsp;" : ch}</span>`)
    .join("");
  quizBody.innerHTML = `
 <div class="quiz-intro-stage">
 <div class="qi-stars" aria-hidden="true">${
    Array.from({ length: 28 }, (_, i) => `<span class="qi-star qi-s${i}"></span>`).join("")
  }</div>
 <div class="qi-shoot qi-shoot-1" aria-hidden="true"></div>
 <div class="qi-shoot qi-shoot-2" aria-hidden="true"></div>

 <div class="quiz-scene" aria-hidden="true" style="--p1:${palette.p1};--p2:${palette.p2};--p3:${palette.p3};--accent:${palette.accent};">
 <span class="${planetClass}">
 <span class="qs-spot"></span>
 <span class="qs-band qs-band-a"></span>
 <span class="qs-band qs-band-b"></span>
 </span>
 <span class="qs-ring"></span>
 <span class="qs-rocket">
 <svg viewBox="0 0 32 64" width="46" height="86" aria-hidden="true">
 <path d="M16 2 C 11 10 8 18 8 28 L 8 44 L 24 44 L 24 28 C 24 18 21 10 16 2 Z" fill="#f4f4f8"/>
 <circle cx="16" cy="22" r="3.4" fill="#7adfff"/>
 <path d="M8 38 L 4 48 L 8 44 Z M 24 38 L 28 48 L 24 44 Z" fill="#d94848"/>
 <path d="M11 44 L 11 50 L 16 56 L 21 50 L 21 44 Z" fill="#ffb650"/>
 <path d="M13 50 L 16 60 L 19 50 Z" fill="#fff3c2"/>
 </svg>
 <span class="qs-flame"></span>
 </span>
 </div>

 <h2 class="quiz-intro-title">${titleLetters}<span class="ql-quiz">quiz</span></h2>
 <p class="quiz-intro-sub">${total} question${total === 1 ? "" : "s"}, no time limit, just fun.</p>
 <button type="button" class="quiz-intro-cta" id="quiz-start">
 <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
 <path d="M8 1.5 C 5.8 4 4.8 6.4 4.8 8.8 L 4.8 10.6 L 6.2 10.6 L 6.2 12 L 4.2 13.4 L 5.2 13.9 L 6.2 13.2 L 6.8 13.9 L 8 13 L 9.2 13.9 L 9.8 13.2 L 10.8 13.9 L 11.8 13.4 L 9.8 12 L 9.8 10.6 L 11.2 10.6 L 11.2 8.8 C 11.2 6.4 10.2 4 8 1.5 Z" fill="currentColor"/>
 </svg>
 Tap to launch
 </button>
 </div>`;
  const startBtn = document.getElementById("quiz-start");
  if (startBtn) {
    startBtn.addEventListener("click", () => {
      s.started = true;
      quizOverlay.classList.remove("is-intro");
      runCountdownThen(() => renderQuiz());
    });
    setTimeout(() => startBtn.focus(), 50);
  }
}

// Solid-colour feature class per planet so the splash planet has character
const PLANET_FEATURE_CLASS = {
  Sun:     "qp-sun",
  Mercury: "qp-mercury",
  Venus:   "qp-venus",
  Earth:   "qp-earth",
  Moon:    "qp-moon",
  Mars:    "qp-mars",
  Jupiter: "qp-jupiter",
  Saturn:  "qp-saturn",
  Uranus:  "qp-uranus",
  Neptune: "qp-neptune",
  Pluto:   "qp-pluto",
};

// Per-quiz colour palette for the splash scene
const QUIZ_PALETTE = {
  default:  { p1: "#ffd28a", p2: "#e07a3a", p3: "#3a0f06", accent: "#ffc04d" },
  Sun:      { p1: "#fff1c2", p2: "#ffb44d", p3: "#7a3700", accent: "#ffc04d" },
  Mercury:  { p1: "#d8d2c8", p2: "#a08a72", p3: "#3a2a1a", accent: "#e0b890" },
  Venus:    { p1: "#ffe6b0", p2: "#dba85a", p3: "#553200", accent: "#f0c060" },
  Earth:    { p1: "#a8e1ff", p2: "#3b78c4", p3: "#0a2a55", accent: "#7adfff" },
  Moon:     { p1: "#f4f1e8", p2: "#9c9586", p3: "#2a261d", accent: "#e8e0c8" },
  Mars:     { p1: "#ffcfa8", p2: "#c14a2a", p3: "#3a0f02", accent: "#ff7a4a" },
  Jupiter:  { p1: "#ffe0c0", p2: "#c8804a", p3: "#3a2008", accent: "#ffb068" },
  Saturn:   { p1: "#ffeebb", p2: "#d8a85a", p3: "#3a2a0a", accent: "#f6d168" },
  Uranus:   { p1: "#c8f0ff", p2: "#6ec8d2", p3: "#0e3540", accent: "#9be6ee" },
  Neptune:  { p1: "#a8c0ff", p2: "#3c5fc8", p3: "#091840", accent: "#7ea0ff" },
  Pluto:    { p1: "#e8d8c0", p2: "#a07a5a", p3: "#2a1f12", accent: "#d8b890" },
};

function runCountdownThen(after) {
  const steps = [
    { label: "3", cls: "cd-3" },
    { label: "2", cls: "cd-2" },
    { label: "1", cls: "cd-1" },
    { label: "GO!", cls: "cd-go" },
  ];
  const stepMs = 600;
  quizBody.innerHTML = `<div class="quiz-countdown" aria-live="polite"><span class="cd-num"></span></div>`;
  const numEl = quizBody.querySelector(".cd-num");
  let i = 0;
  function tick() {
    if (!quizState || quizState.aborted) return;
    if (i >= steps.length) { after(); return; }
    const step = steps[i++];
    numEl.textContent = step.label;
    numEl.className = "cd-num " + step.cls;
    // Force reflow to restart the animation
    void numEl.offsetWidth;
    setTimeout(tick, stepMs);
  }
  tick();
}

function closeQuiz() {
  if (quizState) quizState.aborted = true;
  quizOverlay.classList.remove("is-intro");
  quizOverlay.hidden = true;
  quizState = null;
}

function renderQuiz() {
  const s = quizState;
  if (!s) return;
  const total = s.questions.length;

  if (s.idx >= total) {
    // Final score
    quizProgressFill.style.width = "100%";
    let msg, mood;
    if (s.score === total) {
      msg = `You\u2019re a ${s.name} expert!`;
      mood = "perfect";
    } else if (s.score >= total - 1) {
      msg = `Awesome, you really know your stuff!`;
      mood = "great";
    } else if (s.score >= Math.ceil(total / 2)) {
      msg = `Nice work. Read the panel and try again.`;
      mood = "good";
    } else {
      msg = `Tricky! Read the facts and beat your score.`;
      mood = "tryagain";
    }
    quizBody.innerHTML = `
 <div class="quiz-end ${mood}">
 <div class="quiz-end-stars" aria-hidden="true">
 ${Array.from({ length: total }, (_, i) =>
   `<span class="qe-star ${i < s.score ? "is-on" : ""}" style="--d:${i * 70}ms"></span>`
 ).join("")}
 </div>
 <div class="quiz-end-score" aria-hidden="true">
 <span class="qe-score-num" data-target="${s.score}">0</span>
 <span class="qe-score-of">/ ${total}</span>
 </div>
 <p class="quiz-end-msg">${msg}</p>
 <div class="quiz-actions">
 <button type="button" class="quiz-btn" id="quiz-retry">Play again</button>
 <button type="button" class="quiz-btn quiz-btn-secondary" id="quiz-done">Close</button>
 </div>
 </div>`;
    // Count score up
    const numEl = quizBody.querySelector(".qe-score-num");
    if (numEl) {
      const target = s.score;
      const dur = 600 + target * 80;
      const start = performance.now();
      function tickScore(now) {
        if (!quizState) return;
        const k = Math.min((now - start) / dur, 1);
        const ease = 1 - Math.pow(1 - k, 3);
        numEl.textContent = Math.round(target * ease);
        if (k < 1) requestAnimationFrame(tickScore);
      }
      requestAnimationFrame(tickScore);
    }
    if (s.score === total) burstConfetti();
    document
      .getElementById("quiz-retry")
      .addEventListener("click", () => openQuiz(s.name));
    document.getElementById("quiz-done").addEventListener("click", closeQuiz);
    return;
  }

  const q = s.questions[s.idx];
  quizProgressFill.style.width = `${(s.idx / total) * 100}%`;
  // Score dots: filled = correct so far, empty = upcoming, ring = current
  const dotsHTML = Array.from({ length: total }, (_, i) => {
    let cls = "qdot";
    if (i < s.idx) cls += s.questions[i]._wasCorrect ? " is-correct" : " is-wrong";
    if (i === s.idx) cls += " is-current";
    return `<span class="${cls}"></span>`;
  }).join("");
  let html = `
 <div class="quiz-score-row" aria-hidden="true">${dotsHTML}</div>
 <div class="quiz-step">Question ${s.idx + 1} of ${total}</div>
 <p class="quiz-q">${q.q}</p>
 <div class="quiz-choices">`;
  q.choices.forEach((c, i) => {
    html += `<button type="button" class="quiz-choice" data-i="${i}" style="--d:${i * 80}ms">${c}</button>`;
  });
  html += `</div><div class="quiz-feedback" hidden></div>`;
  quizBody.innerHTML = html;
  // Trigger a question-enter animation by toggling a class
  quizBody.classList.remove("q-enter");
  void quizBody.offsetWidth;
  quizBody.classList.add("q-enter");

  const fb = quizBody.querySelector(".quiz-feedback");
  quizBody.querySelectorAll(".quiz-choice").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (s.answered) return;
      s.answered = true;
      const picked = parseInt(btn.dataset.i, 10);
      const correct = picked === q.answer;
      q._wasCorrect = correct;
      if (correct) s.score++;
      quizBody.querySelectorAll(".quiz-choice").forEach((b, i) => {
        b.disabled = true;
        if (i === q.answer) b.classList.add("correct");
        else if (i === picked) b.classList.add("wrong");
      });
      // Light tap haptic on supporting touch devices
      if (navigator.vibrate) {
        try { navigator.vibrate(correct ? 18 : [12, 60, 12]); } catch (_) {}
      }
      fb.hidden = false;
      fb.innerHTML =
        `<div class="${correct ? "fb-good" : "fb-bad"}">${correct ? "✓ Correct!" : "✗ Not quite."}</div>` +
        `<div class="fb-why">${q.why}</div>` +
        `<button type="button" class="quiz-btn" id="quiz-next">${s.idx + 1 === total ? "See score" : "Next →"}</button>`;
      document.getElementById("quiz-next").addEventListener("click", () => {
        s.idx++;
        s.answered = false;
        renderQuiz();
      });
    });
  });
}

quizClose.addEventListener("click", closeQuiz);
quizOverlay.addEventListener("click", (e) => {
  if (e.target === quizOverlay) closeQuiz();
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !quizOverlay.hidden) closeQuiz();
});
// =================== /QUIZ ===================

// =================== STAR CONFETTI ===================
const confettiCanvas = document.getElementById("confetti");
const confettiCtx = confettiCanvas.getContext("2d");
let confettiParticles = [];
let confettiRunning = false;
let confettiLastT = 0;

function sizeConfettiCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  confettiCanvas.width = window.innerWidth * dpr;
  confettiCanvas.height = window.innerHeight * dpr;
  confettiCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
sizeConfettiCanvas();
window.addEventListener("resize", sizeConfettiCanvas);

const STAR_COLORS = [
  "#ffd84d",
  "#ff7755",
  "#7ad7ff",
  "#9d8aff",
  "#7be39e",
  "#ff9ad4",
  "#ffffff",
];

function drawStar(ctx, x, y, r, points = 5) {
  const inner = r * 0.45;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const ang = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const rad = i % 2 === 0 ? r : inner;
    const px = Math.cos(ang) * rad;
    const py = Math.sin(ang) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function spawnConfetti(count = 140) {
  const W = window.innerWidth;
  for (let i = 0; i < count; i++) {
    confettiParticles.push({
      x: Math.random() * W,
      y: -20 - Math.random() * 80,
      vx: (Math.random() - 0.5) * 180,
      vy: 80 + Math.random() * 180,
      size: 6 + Math.random() * 10,
      color: STAR_COLORS[(Math.random() * STAR_COLORS.length) | 0],
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 6,
      life: 0,
      ttl: 4 + Math.random() * 2.5,
      points: Math.random() < 0.5 ? 5 : 6,
    });
  }
  if (!confettiRunning) {
    confettiRunning = true;
    confettiLastT = performance.now();
    requestAnimationFrame(animateConfetti);
  }
}

function burstConfetti() {
  // First wave + a couple of staggered follow-ups for a celebratory feel
  spawnConfetti(120);
  setTimeout(() => spawnConfetti(80), 250);
  setTimeout(() => spawnConfetti(60), 600);
}

function animateConfetti(now) {
  const dt = Math.min((now - confettiLastT) / 1000, 0.05);
  confettiLastT = now;

  const W = window.innerWidth;
  const H = window.innerHeight;
  confettiCtx.clearRect(0, 0, W, H);

  const G = 280; // gravity px/s²
  for (let i = confettiParticles.length - 1; i >= 0; i--) {
    const p = confettiParticles[i];
    p.life += dt;
    p.vy += G * dt;
    p.vx *= 0.995; // slight air drag
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vrot * dt;

    // Fade out near end of life
    const fade = p.life > p.ttl - 0.8 ? Math.max(0, (p.ttl - p.life) / 0.8) : 1;

    confettiCtx.save();
    confettiCtx.translate(p.x, p.y);
    confettiCtx.rotate(p.rot);
    confettiCtx.globalAlpha = fade;
    confettiCtx.fillStyle = p.color;
    // Soft glow
    confettiCtx.shadowColor = p.color;
    confettiCtx.shadowBlur = 8;
    drawStar(confettiCtx, 0, 0, p.size, p.points);
    confettiCtx.restore();

    if (p.life > p.ttl || p.y > H + 40) confettiParticles.splice(i, 1);
  }

  if (confettiParticles.length > 0) {
    requestAnimationFrame(animateConfetti);
  } else {
    confettiCtx.clearRect(0, 0, W, H);
    confettiRunning = false;
  }
}
// =================== /CONFETTI ===================

function openInfo() {
  if (!zoomedOn) return;
  const name = zoomedOn.userData.name || "";
  const data = zoomedOn.userData.detailsData;
  infoTitle.textContent = name;
  let html = "";
  if (data) {
    if (data.tagline) html += `<div class="info-tagline">${data.tagline}</div>`;
    if (data.image) {
      html += `<img class="info-img" src="${data.image}" alt="${name}" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling&&this.nextElementSibling.classList.contains('info-credit')&&(this.nextElementSibling.style.display='none')" />`;
      if (data.credit) html += `<div class="info-credit">${data.credit}</div>`;
    }
    // Show every intro paragraph so the description is richer
    for (const para of data.intro || []) {
      html += `<p>${para}</p>`;
    }
    // Quick-stat strip if we have stats
    if (data.stats && Object.keys(data.stats).length) {
      const entries = Object.entries(data.stats).slice(0, 3);
      html += `<div class="quick-stats">`;
      for (const [k, v] of entries) {
        html += `<div class="qs"><div class="qs-k">${k}</div><div class="qs-v">${v}</div></div>`;
      }
      html += `</div>`;
    }
    html += `<div class="info-actions">`;
    if (QUIZZES[name]) {
      html += `<button type="button" class="quiz-launch" data-quiz="${name}">Take the ${name} quiz <span aria-hidden="true">→</span></button>`;
    }
    html += `<button type="button" class="explore-btn" id="explore-cta">Explore ${name}</button>`;
    html += `</div>`;
  } else {
    html = zoomedOn.userData.details || "";
    if (QUIZZES[name]) {
      html += `<button type="button" class="quiz-launch" data-quiz="${name}">Take the ${name} quiz <span aria-hidden="true">→</span></button>`;
    }
  }
  infoBody.innerHTML = html;
  const quizBtn = infoBody.querySelector(".quiz-launch");
  if (quizBtn)
    quizBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openQuiz(quizBtn.dataset.quiz);
    });
  const exploreBtn = infoBody.querySelector("#explore-cta");
  if (exploreBtn) {
    exploreBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeInfo();
      showHotspotsForCurrent();
    });
  }
  infoPanel.hidden = false;
}
function closeInfo() {
  infoPanel.hidden = true;
}

// =================== INTERACTIVE HOTSPOTS ===================
// Use var so these hoist as `undefined` — animate() runs synchronously at
// module load and calls updateHotspots before this section evaluates.
var hotspotsEl = document.getElementById("hotspots");
var sectionPop = document.getElementById("section-pop");
var sectionPopTitle = document.getElementById("section-pop-title");
var sectionPopBody = document.getElementById("section-pop-body");
var sectionPopClose = document.getElementById("section-pop-close");
var hotEls = hotspotsEl ? Array.from(hotspotsEl.querySelectorAll(".hot")) : [];

// Hotspot screen-space anchors relative to body center (normalized to body radius)
// [angle in degrees from top, outward distance multiplier of body radius]
// Hotspot positions are computed dynamically in updateHotspots based on
// how many pills are currently visible. Kept as a constant for reference only.
const HOTSPOT_DIST_MULT = 1.6;

function bodyScreenInfo(obj) {
  // Compute screen-space center and approximate radius
  const center = new THREE.Vector3();
  obj.getWorldPosition(center);
  const projected = center.clone().project(camera);
  if (projected.z < -1 || projected.z > 1) return null;
  const sx = (projected.x * 0.5 + 0.5) * window.innerWidth;
  const sy = (-projected.y * 0.5 + 0.5) * window.innerHeight;

  // Estimate apparent radius from bounding sphere
  let r = 1;
  if (obj.geometry) {
    if (!obj.geometry.boundingSphere) obj.geometry.computeBoundingSphere();
    r = obj.geometry.boundingSphere.radius * Math.max(obj.scale.x, obj.scale.y, obj.scale.z);
  }
  // Project a point on the sphere edge to get screen radius
  const edgeWorld = center.clone().add(camera.up.clone().multiplyScalar(r));
  const edgeProj = edgeWorld.clone().project(camera);
  const ex = (edgeProj.x * 0.5 + 0.5) * window.innerWidth;
  const ey = (-edgeProj.y * 0.5 + 0.5) * window.innerHeight;
  const screenR = Math.hypot(ex - sx, ey - sy);
  return { x: sx, y: sy, r: Math.max(36, screenR) };
}

// Even angle layouts for 1..4 visible pills (degrees, 0 = right, -90 = top)
const PILL_LAYOUTS = {
  1: [-90],
  2: [-90, 90],
  3: [-90, 30, 150],
  4: [-90, 0, 90, 180],
};

function updateHotspots() {
  if (!hotspotsEl || hotspotsEl.hidden || !zoomedOn) return;
  const info = bodyScreenInfo(zoomedOn);
  const visible = hotEls.filter((e) => !e.hidden);
  if (!info) {
    for (const el of visible) el.style.opacity = "0";
    return;
  }
  const baseR = Math.max(info.r, 80);
  const dist = baseR * HOTSPOT_DIST_MULT + 30;
  const angles = PILL_LAYOUTS[visible.length] || [-90, 0, 90, 180];
  visible.forEach((el, idx) => {
    const angleRad = (angles[idx] * Math.PI) / 180;
    const x = info.x + Math.cos(angleRad) * dist;
    const y = info.y + Math.sin(angleRad) * dist;
    el.style.left = x + "px";
    el.style.top = y + "px";
    el.style.opacity = "";
  });
}

// Section visual config — one solid colour per section, simple icons
const SECTION_META = {
  about:  { label: "About",          color: "#ffd166", icon: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 5 H 10.5 a2 2 0 0 1 1.5 1.5 V 20 a1.5 1.5 0 0 0-1.5-1.5 H 4 Z M 20 5 H 13.5 A 2 2 0 0 0 12 6.5 V 20 a 1.5 1.5 0 0 1 1.5-1.5 H 20 Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>' },
  facts:  { label: "Wow facts",      color: "#ff8c69", icon: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 2.5 L14.4 8.6 L21 9.1 L16 13.2 L17.6 19.5 L12 16.2 L6.4 19.5 L8 13.2 L3 9.1 L9.6 8.6 Z" fill="currentColor"/></svg>' },
  stats:  { label: "By the numbers", color: "#7adfb9", icon: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="3" y="13" width="4" height="8" rx="1" fill="currentColor"/><rect x="10" y="8" width="4" height="13" rx="1" fill="currentColor"/><rect x="17" y="4" width="4" height="17" rx="1" fill="currentColor"/></svg>' },
  inside: { label: "Inside",         color: "#b8a6e8", icon: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>' },
};

// Internal cross-sections. outerFrac is each layer's outer boundary as a
// fraction of body radius. Inner boundary = previous layer's outerFrac (or 0).
const LAYERS = {
  Sun: [
    { name: "Core",            outerFrac: 0.25,  color: "#fff4c2", desc: "Hydrogen squeezes into helium at 15 million °C. All the Sun's energy is born here." },
    { name: "Radiative zone",  outerFrac: 0.70,  color: "#ffd76b", desc: "Light made in the core bounces around for thousands of years trying to escape this dense layer." },
    { name: "Convective zone", outerFrac: 0.93,  color: "#ff9a3c", desc: "Giant bubbles of hot gas carry heat up to the surface, like a vast boiling soup." },
    { name: "Photosphere",     outerFrac: 0.96,  color: "#ffb84d", desc: "The glowing 'surface' we see, around 5,500 °C. Sunspots live in this layer." },
    { name: "Chromosphere",    outerFrac: 0.985, color: "#ff7a6b", desc: "A reddish layer of cooler gas. Usually only visible during a total solar eclipse." },
    { name: "Corona",          outerFrac: 1.0,   color: "#d6dcff", desc: "The wispy outer atmosphere. Strangely, it's millions of degrees hotter than the surface below." },
  ],
  Mercury: [
    { name: "Inner core",      outerFrac: 0.30,  color: "#c8ad8c", desc: "Solid iron at the very centre, about the size of our Moon." },
    { name: "Outer core",      outerFrac: 0.85,  color: "#d4af7a", desc: "Molten iron. Mercury's metal heart is huge, it takes up about 80% of the planet." },
    { name: "Mantle",          outerFrac: 0.97,  color: "#9b8466", desc: "A thin shell of rock wrapped around the giant core." },
    { name: "Crust",           outerFrac: 1.0,   color: "#7d6b54", desc: "Cratered grey surface with tall cliffs from when the planet shrank as it cooled." },
  ],
  Venus: [
    { name: "Core",            outerFrac: 0.51,  color: "#ffcf6b", desc: "Iron-nickel heart. We think most of it is still molten." },
    { name: "Mantle",          outerFrac: 0.99,  color: "#d49a4a", desc: "Hot rock that feeds Venus's many thousands of volcanoes." },
    { name: "Crust",           outerFrac: 1.0,   color: "#a87a3a", desc: "Thin volcanic crust hiding under a crushing toxic atmosphere." },
  ],
  Earth: [
    { name: "Inner core",      outerFrac: 0.19,  color: "#fff0c2", desc: "Solid iron-nickel ball, as hot as the Sun's surface, about 5,400 °C." },
    { name: "Outer core",      outerFrac: 0.55,  color: "#ff9a3c", desc: "Swirling liquid iron. Its motion creates Earth's magnetic field, the thing that makes compasses work." },
    { name: "Mantle",          outerFrac: 0.996, color: "#c54a2c", desc: "Hot, slow-flowing rock. It moves the continents over millions of years." },
    { name: "Crust",           outerFrac: 1.0,   color: "#6f8e4e", desc: "The thin rocky shell we live on. Compared to the whole planet it's thinner than an apple peel." },
  ],
  Moon: [
    { name: "Inner core",      outerFrac: 0.13,  color: "#ffb84d", desc: "A tiny solid iron centre, about 240 km across." },
    { name: "Outer core",      outerFrac: 0.21,  color: "#ffd166", desc: "A thin shell of melted iron around the inner core." },
    { name: "Mantle",          outerFrac: 0.99,  color: "#9d8b78", desc: "Solid rock that had volcanoes long, long ago." },
    { name: "Crust",           outerFrac: 1.0,   color: "#cfc5b6", desc: "Grey rock covered in fine dust from billions of years of meteor strikes." },
  ],
  Mars: [
    { name: "Core",            outerFrac: 0.50,  color: "#ffb07a", desc: "Mostly molten iron and sulphur. Bigger than scientists used to think." },
    { name: "Mantle",          outerFrac: 0.98,  color: "#c75a3a", desc: "Rocky layer that once powered Olympus Mons, the biggest volcano in the solar system." },
    { name: "Crust",           outerFrac: 1.0,   color: "#8a3a1f", desc: "Rusty red surface. The iron in the rocks has actually rusted." },
  ],
  Jupiter: [
    { name: "Core region",       outerFrac: 0.18, color: "#5b4a3a", desc: "A fuzzy mix of rock, metal and gas. About 10 Earths' worth of stuff." },
    { name: "Metallic hydrogen", outerFrac: 0.78, color: "#7d6a55", desc: "Hydrogen squeezed so hard it behaves like liquid metal. Powers Jupiter's huge magnetic field." },
    { name: "Liquid hydrogen",   outerFrac: 0.96, color: "#caa97e", desc: "A deep ocean of liquid hydrogen and helium with no real surface." },
    { name: "Cloud tops",        outerFrac: 1.0,  color: "#e8d3a8", desc: "The famous coloured bands and the Great Red Spot live here." },
  ],
  Saturn: [
    { name: "Core region",       outerFrac: 0.20, color: "#5b4f3a", desc: "Small dense centre of rock and ice." },
    { name: "Metallic hydrogen", outerFrac: 0.50, color: "#8a7a5a", desc: "Same exotic liquid-metal hydrogen as Jupiter has." },
    { name: "Liquid hydrogen",   outerFrac: 0.95, color: "#d4be8a", desc: "Deep liquid hydrogen and helium ocean." },
    { name: "Cloud tops",        outerFrac: 1.0,  color: "#f0d9a0", desc: "Soft pastel bands of cream and gold with super-fast winds." },
  ],
  Uranus: [
    { name: "Core region", outerFrac: 0.20, color: "#3a4a5b", desc: "Small core of rock and ice." },
    { name: "Icy mantle",  outerFrac: 0.85, color: "#7ec6c8", desc: "A hot dense slush of water, methane and ammonia ices. That's why Uranus is called an 'ice giant'." },
    { name: "Atmosphere",  outerFrac: 1.0,  color: "#bce6e8", desc: "Hydrogen, helium and methane. Methane is what makes Uranus look turquoise." },
  ],
  Neptune: [
    { name: "Core region", outerFrac: 0.20, color: "#2a3b5b", desc: "Earth-sized core of rock and ice." },
    { name: "Icy mantle",  outerFrac: 0.85, color: "#4a7ac8", desc: "Super-hot dense ice soup. Some scientists think it might actually rain diamonds inside." },
    { name: "Atmosphere",  outerFrac: 1.0,  color: "#5b8de8", desc: "Methane gives Neptune its deep blue, and the fastest winds in the solar system, over 2,000 km/h." },
  ],
  Pluto: [
    { name: "Rocky core",          outerFrac: 0.70, color: "#6e5340", desc: "A big rocky heart, about 70% of Pluto's size." },
    { name: "Water-ice mantle",    outerFrac: 0.96, color: "#a8c0d8", desc: "There might even be a hidden liquid water ocean hiding under the ice." },
    { name: "Nitrogen ice crust",  outerFrac: 1.0,  color: "#e4d6c4", desc: "Frozen nitrogen and methane. The famous heart-shaped Tombaugh Regio lives here." },
  ],
};

function sectionHeaderHTML(section, subtitle) {
  const meta = SECTION_META[section];
  return `<div class="sp-header" style="--accent:${meta.color};">
    <span class="sp-header-icon" style="color:${meta.color};">${meta.icon}</span>
    <div class="sp-header-titles">
      <div class="sp-header-title">${meta.label}</div>
      <div class="sp-header-sub">${subtitle}</div>
    </div>
  </div>`;
}

// Build the SVG cross-section + tappable layer list for the Inside section.
// Uses min-width normalization so thin layers stay visible without overflowing
// the body's radius.
function buildLayersHTML(layers, accent) {
  const R = 100; // SVG radius units
  const N = layers.length;
  const minBand = 9;
  // True band widths (outerFrac - innerFrac), with inner = prev.outerFrac
  const trueWidths = layers.map((l, i) => {
    const inner = i === 0 ? 0 : layers[i - 1].outerFrac;
    return Math.max(0.0001, l.outerFrac - inner);
  });
  const totalTrue = trueWidths.reduce((a, b) => a + b, 0);
  const available = Math.max(0, R - N * minBand);
  const visWidths = trueWidths.map((w) => minBand + available * (w / totalTrue));
  // Accumulate outer radii so each circle is drawn from origin
  const outerRs = [];
  let acc = 0;
  for (let i = 0; i < N; i++) {
    acc += visWidths[i];
    outerRs.push(acc);
  }
  let svg = `<svg class="layers-svg" viewBox="-110 -110 220 220" role="img" aria-label="Cross-section">`;
  // Draw outermost first so inner circles cover the centre — natural rings
  for (let i = N - 1; i >= 0; i--) {
    svg += `<circle class="layer-ring" data-layer="${i}" data-r="${outerRs[i].toFixed(2)}" cx="0" cy="0" r="${outerRs[i].toFixed(2)}" fill="${layers[i].color}"/>`;
  }
  // Selected outline overlay (drawn last so it's on top)
  svg += `<circle id="layer-highlight" cx="0" cy="0" r="0" fill="none" stroke="${accent}" stroke-width="2.4" style="pointer-events:none;opacity:0;"/>`;
  svg += `</svg>`;
  let list = `<div class="layer-list" role="list">`;
  layers.forEach((l, i) => {
    list += `<button class="layer-item" type="button" role="listitem" data-layer="${i}" data-r="${outerRs[i].toFixed(2)}" aria-pressed="false">
      <span class="layer-swatch" style="background:${l.color};"></span>
      <span class="layer-info">
        <span class="layer-name">${l.name}</span>
        <span class="layer-desc">${l.desc}</span>
      </span>
    </button>`;
  });
  list += `</div>`;
  return `<div class="layers-wrap">${svg}${list}</div>`;
}

function openSection(section) {
  if (!zoomedOn) return;
  const data = zoomedOn.userData.detailsData;
  if (!data) return;
  const name = zoomedOn.userData.name || "";
  const meta = SECTION_META[section];
  sectionPop.dataset.section = section;
  let html = sectionHeaderHTML(section, name);
  html += `<div class="sp-content">`;
  if (section === "about") {
    if (data.tagline) html += `<p class="sp-tagline">${data.tagline}</p>`;
    if (data.image) {
      html += `<img class="sp-img" src="${data.image}" alt="${name}" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'" />`;
    }
    for (const para of data.intro || []) html += `<p class="sp-p">${para}</p>`;
    if (!(data.intro && data.intro.length)) html += `<p class="sp-p">No description yet.</p>`;
  } else if (section === "facts") {
    if (data.facts && data.facts.length) {
      html += `<ul class="facts-list">`;
      data.facts.forEach((f, i) => {
        html += `<li class="fact-item" style="--d:${i * 50}ms;">
          <span class="fact-num" style="color:${meta.color};">${i + 1}</span>
          <span class="fact-text">${f}</span>
        </li>`;
      });
      html += `</ul>`;
    } else {
      html += `<p class="sp-p">No fun facts yet, check back soon.</p>`;
    }
  } else if (section === "stats") {
    if (data.stats && Object.keys(data.stats).length) {
      html += `<dl class="stats-list">`;
      Object.entries(data.stats).forEach(([k, v], i) => {
        html += `<div class="stat-row" style="--d:${i * 40}ms;">
          <dt class="stat-k">${k}</dt>
          <dd class="stat-v">${v}</dd>
        </div>`;
      });
      html += `</dl>`;
    } else {
      html += `<p class="sp-p">No numbers to show.</p>`;
    }
  } else if (section === "inside") {
    const layers = LAYERS[name];
    if (layers && layers.length) {
      html += `<p class="sp-tagline">Tap a layer to learn more.</p>`;
      html += buildLayersHTML(layers, meta.color);
    } else {
      html += `<p class="sp-p">No inside view available for ${name}.</p>`;
    }
  }
  html += `</div>`;
  sectionPop.innerHTML = `<button id="section-pop-close" class="section-pop-close" type="button" aria-label="Close">×</button>${html}`;
  // Re-bind close button
  const closeBtn = sectionPop.querySelector("#section-pop-close");
  if (closeBtn) closeBtn.addEventListener("click", closeSectionPop);
  // Wire up layer interactivity if present
  if (section === "inside") {
    const layerBtns = Array.from(sectionPop.querySelectorAll(".layer-item"));
    const layerRings = Array.from(sectionPop.querySelectorAll(".layer-ring"));
    const highlight = sectionPop.querySelector("#layer-highlight");
    const selectLayer = (i) => {
      layerBtns.forEach((b, idx) => {
        const sel = idx === i;
        b.setAttribute("aria-pressed", sel ? "true" : "false");
        b.classList.toggle("is-selected", sel);
      });
      if (highlight) {
        const r = layerBtns[i] ? layerBtns[i].dataset.r : 0;
        highlight.setAttribute("r", r);
        highlight.style.opacity = "1";
      }
    };
    layerBtns.forEach((btn) =>
      btn.addEventListener("click", () => selectLayer(parseInt(btn.dataset.layer, 10))),
    );
    layerRings.forEach((r) =>
      r.addEventListener("click", () => selectLayer(parseInt(r.dataset.layer, 10))),
    );
    // Auto-select outermost layer as default
    if (layerBtns.length) selectLayer(layerBtns.length - 1);
  }
  // Hide hotspots while popup is open so nothing overlaps
  hotspotsEl.hidden = true;
  sectionPop.hidden = false;
  // Position the popup: prefer left of the body, else right, else center
  const info = bodyScreenInfo(zoomedOn);
  if (info) {
    const popW = sectionPop.offsetWidth || 380;
    const popH = sectionPop.offsetHeight || 360;
    let left = info.x - info.r - popW - 24;
    if (left < 16) left = info.x + info.r + 24;
    if (left + popW > window.innerWidth - 16) left = Math.max(16, (window.innerWidth - popW) / 2);
    let top = Math.max(16, info.y - popH / 2);
    if (top + popH > window.innerHeight - 16) top = Math.max(16, window.innerHeight - popH - 16);
    sectionPop.style.left = left + "px";
    sectionPop.style.top = top + "px";
    sectionPop.style.transform = "";
  } else {
    sectionPop.style.left = "50%";
    sectionPop.style.top = "50%";
    sectionPop.style.transform = "translate(-50%, -50%)";
  }
}

function closeSectionPop() {
  sectionPop.hidden = true;
  // Restore hotspots if we still have a zoomed body with details
  if (zoomedOn && zoomedOn.userData.detailsData) {
    hotspotsEl.hidden = false;
  }
}

for (const el of hotEls) {
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    openSection(el.dataset.section);
  });
}
if (sectionPopClose) sectionPopClose.addEventListener("click", closeSectionPop);
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !sectionPop.hidden) closeSectionPop();
});

function showHotspotsForCurrent() {
  if (!zoomedOn || !zoomedOn.userData.detailsData) {
    hotspotsEl.hidden = true;
    return;
  }
  const name = zoomedOn.userData.name;
  // Hide Inside pill if no layer data for this body
  for (const el of hotEls) {
    if (el.dataset.section === "inside") {
      el.hidden = !(LAYERS[name] && LAYERS[name].length);
    } else {
      el.hidden = false;
    }
  }
  hotspotsEl.hidden = false;
  // Reset entry animation
  for (const el of hotEls) {
    if (el.hidden) continue;
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.animation = "";
  }
}

function hideHotspots() {
  hotspotsEl.hidden = true;
  closeSectionPop();
}
// =================== /HOTSPOTS ===================

infoToggle.addEventListener("click", (e) => {
  e.stopPropagation();
  if (infoPanel.hidden) openInfo();
  else closeInfo();
});
infoClose.addEventListener("click", closeInfo);

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !infoPanel.hidden) closeInfo();
});

// Group definitions, in display order
const SEARCH_GROUPS = [
  { label: "Star", kinds: ["star"], icon: "sun" },
  { label: "Planets", kinds: ["planet"], icon: "planet" },
  { label: "Moons", kinds: ["moon"], icon: "moon" },
  { label: "Dwarf planets", kinds: ["dwarf"], icon: "dwarf" },
  { label: "Distant stars", kinds: ["farstar"], icon: "star" },
  { label: "Black hole", kinds: ["blackhole"], icon: "bh" },
];

// Inline SVG icons (no emoji per design rules)
const GROUP_ICONS = {
  sun: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="3.2" fill="#ffc04d"/><g stroke="#ffc04d" stroke-width="1.2" stroke-linecap="round"><line x1="8" y1="1.5" x2="8" y2="3.2"/><line x1="8" y1="12.8" x2="8" y2="14.5"/><line x1="1.5" y1="8" x2="3.2" y2="8"/><line x1="12.8" y1="8" x2="14.5" y2="8"/><line x1="3.2" y1="3.2" x2="4.4" y2="4.4"/><line x1="11.6" y1="11.6" x2="12.8" y2="12.8"/><line x1="3.2" y1="12.8" x2="4.4" y2="11.6"/><line x1="11.6" y1="4.4" x2="12.8" y2="3.2"/></g></svg>',
  planet:
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><ellipse cx="8" cy="8" rx="7" ry="2.2" fill="none" stroke="#9ed7e0" stroke-width="1" transform="rotate(-20 8 8)"/><circle cx="8" cy="8" r="3.2" fill="#6aa8e0"/></svg>',
  moon: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="4" fill="#cfd2d8"/><circle cx="9.6" cy="7" r="3.6" fill="#0a0c18"/></svg>',
  dwarf:
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="2.2" fill="#c7a890"/></svg>',
  star: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 2 L9.4 6.6 L14.2 6.6 L10.4 9.4 L11.8 14 L8 11.2 L4.2 14 L5.6 9.4 L1.8 6.6 L6.6 6.6 Z" fill="#fff7d6"/></svg>',
  bh: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="#ff7755" stroke-width="1.4"/><circle cx="8" cy="8" r="3.2" fill="#000"/></svg>',
};

// Larger icons used by category-picker tiles
const GROUP_ICONS_LG = {
  sun: '<svg viewBox="0 0 64 64" width="56" height="56" aria-hidden="true"><circle cx="32" cy="32" r="13" fill="#ffc04d"/><g stroke="#ffc04d" stroke-width="3.5" stroke-linecap="round"><line x1="32" y1="4" x2="32" y2="13"/><line x1="32" y1="51" x2="32" y2="60"/><line x1="4" y1="32" x2="13" y2="32"/><line x1="51" y1="32" x2="60" y2="32"/><line x1="12" y1="12" x2="18" y2="18"/><line x1="46" y1="46" x2="52" y2="52"/><line x1="12" y1="52" x2="18" y2="46"/><line x1="46" y1="18" x2="52" y2="12"/></g></svg>',
  planet: '<svg viewBox="0 0 64 64" width="56" height="56" aria-hidden="true"><ellipse cx="32" cy="32" rx="28" ry="9" fill="none" stroke="#9ed7e0" stroke-width="3" transform="rotate(-22 32 32)"/><circle cx="32" cy="32" r="13" fill="#6aa8e0"/></svg>',
  moon: '<svg viewBox="0 0 64 64" width="56" height="56" aria-hidden="true"><circle cx="32" cy="32" r="18" fill="#cfd2d8"/><circle cx="38" cy="28" r="16" fill="#1a1430"/><circle cx="22" cy="28" r="2" fill="#9aa0aa"/><circle cx="26" cy="38" r="1.6" fill="#9aa0aa"/></svg>',
  dwarf: '<svg viewBox="0 0 64 64" width="56" height="56" aria-hidden="true"><circle cx="22" cy="38" r="6" fill="#c7a890"/><circle cx="38" cy="26" r="9" fill="#a98568"/><circle cx="46" cy="42" r="4" fill="#d4b89e"/></svg>',
  star: '<svg viewBox="0 0 64 64" width="56" height="56" aria-hidden="true"><path d="M32 6 L38 26 L58 26 L42 38 L48 58 L32 46 L16 58 L22 38 L6 26 L26 26 Z" fill="#fff7d6"/></svg>',
  bh: '<svg viewBox="0 0 64 64" width="56" height="56" aria-hidden="true"><circle cx="32" cy="32" r="26" fill="none" stroke="#ff7755" stroke-width="4"/><circle cx="32" cy="32" r="20" fill="none" stroke="#ffaa66" stroke-width="2" opacity="0.6"/><circle cx="32" cy="32" r="13" fill="#000"/></svg>',
};

function colorOf(obj) {
  if (obj.userData.kind === "blackhole") return "#888";
  if (obj.userData.kind === "farstar") {
    const m = obj.material;
    return "#" + (m.color ? m.color.getHexString() : "ffffff");
  }
  return "#" + obj.material.color.getHexString();
}

// Per-item playful SVG art for the picker tiles
function itemArt(o) {
  const c = colorOf(o);
  const name = o.userData.name;
  const kind = o.userData.kind;
  if (kind === "blackhole") {
    return '<svg viewBox="0 0 64 64" width="56" height="56"><circle cx="32" cy="32" r="26" fill="none" stroke="#ff7755" stroke-width="4"/><circle cx="32" cy="32" r="13" fill="#000"/></svg>';
  }
  if (kind === "farstar") {
    return `<svg viewBox="0 0 64 64" width="56" height="56"><path d="M32 10 L37 26 L54 26 L40 36 L45 52 L32 42 L19 52 L24 36 L10 26 L27 26 Z" fill="${c}"/></svg>`;
  }
  // Planets / moons / dwarfs: filled circle with subtle inner shading
  let extra = "";
  if (name === "Saturn") {
    extra = `<ellipse cx="32" cy="32" rx="28" ry="7" fill="none" stroke="#d8c89a" stroke-width="3" transform="rotate(-22 32 32)"/>`;
  } else if (name === "Uranus") {
    extra = `<ellipse cx="32" cy="32" rx="22" ry="5" fill="none" stroke="#bfe7ec" stroke-width="2.2" transform="rotate(78 32 32)"/>`;
  } else if (name === "Jupiter") {
    extra = `<g opacity="0.55"><rect x="14" y="26" width="36" height="2.2" fill="#000"/><rect x="14" y="32" width="36" height="3" fill="#000"/><rect x="14" y="38" width="36" height="2" fill="#000"/></g>`;
  } else if (name === "Earth") {
    extra = `<g fill="#3a8a3a"><circle cx="26" cy="28" r="5"/><circle cx="38" cy="36" r="6"/><circle cx="22" cy="40" r="3"/></g>`;
  } else if (name === "Mars") {
    extra = `<g fill="#000" opacity="0.25"><circle cx="26" cy="26" r="3"/><circle cx="38" cy="36" r="4"/></g>`;
  }
  return `<svg viewBox="0 0 64 64" width="56" height="56"><circle cx="32" cy="32" r="18" fill="${c}"/>${extra}<circle cx="26" cy="26" r="6" fill="#fff" opacity="0.18"/></svg>`;
}

let activeFlat = []; // flat array for keyboard navigation
let activeIdx = 0;
const collapsedGroups = new Set(); // labels that are collapsed
let currentCategory = null; // null => show category picker tiles

const CATEGORY_PROMPTS = {
  Star: "Want to visit our Sun?",
  Planets: "Which planet do you want to see?",
  Moons: "Pick a moon to fly to",
  "Dwarf planets": "Pick a dwarf planet",
  "Distant stars": "Which star shall we look at?",
  "Black hole": "Ready to face the black hole?",
};

function renderCategoryPicker() {
  searchResults.innerHTML = "";
  activeFlat = [];
  searchPanel.classList.add("picking");

  const title = document.createElement("div");
  title.className = "pick-title";
  title.textContent = "What would you like to find?";
  searchResults.appendChild(title);

  const grid = document.createElement("div");
  grid.className = "pick-grid";

  for (const g of SEARCH_GROUPS) {
    const groupItems = clickables.filter((o) => g.kinds.includes(o.userData.kind));
    const count = groupItems.length;
    if (!count) continue;
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = `pick-tile pick-${g.icon}`;
    tile.innerHTML =
      `<span class="pick-art">${GROUP_ICONS_LG[g.icon] || GROUP_ICONS[g.icon] || ""}</span>` +
      `<span class="pick-label">${g.label}</span>` +
      `<span class="pick-count">${count}</span>`;
    tile.addEventListener("click", (e) => {
      e.stopPropagation();
      // Single-item categories (Sun, Black hole) jump straight to 3D
      if (count === 1) {
        selectResult(groupItems[0]);
        return;
      }
      currentCategory = g.label;
      searchInput.value = "";
      renderResults("");
    });
    grid.appendChild(tile);
  }
  searchResults.appendChild(grid);
}

function renderResults(query) {
  if (currentCategory == null) {
    renderCategoryPicker();
    return;
  }
  searchPanel.classList.remove("picking");
  const group = SEARCH_GROUPS.find((g) => g.label === currentCategory);
  if (!group) {
    currentCategory = null;
    renderCategoryPicker();
    return;
  }
  const q = query.trim().toLowerCase();
  searchResults.innerHTML = "";
  activeFlat = [];

  // Header with back button + playful prompt
  const head = document.createElement("div");
  head.className = "cat-head";
  head.innerHTML =
    `<button type="button" class="cat-back" aria-label="Back to categories">‹ Back</button>` +
    `<span class="cat-icon">${GROUP_ICONS[group.icon] || ""}</span>` +
    `<span class="cat-prompt">${CATEGORY_PROMPTS[group.label] || group.label}</span>`;
  head.querySelector(".cat-back").addEventListener("click", (e) => {
    e.stopPropagation();
    currentCategory = null;
    searchInput.value = "";
    renderCategoryPicker();
  });
  searchResults.appendChild(head);

  let totalShown = 0;
  let totalMatched = 0;
  for (const g of [group]) {
    // Preserve scene-creation order (Sun→Mercury→...→Neptune feels natural)
    const items = clickables
      .filter((o) => g.kinds.includes(o.userData.kind))
      .filter((o) => !q || o.userData.name.toLowerCase().includes(q));
    if (!items.length) continue;

    const grid = document.createElement("div");
    grid.className = "pick-grid item-grid";

    for (const o of items) {
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "pick-tile item-tile";
      tile.setAttribute("role", "option");
      tile.innerHTML =
        `<span class="pick-art">${itemArt(o)}</span>` +
        `<span class="pick-label">${o.userData.name}</span>`;
      tile.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectResult(o);
      });
      grid.appendChild(tile);
      activeFlat.push({ row: tile, obj: o });
      totalShown++;
      totalMatched++;
    }

    searchResults.appendChild(grid);
  }

  if (!totalMatched) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No matches.";
    searchResults.appendChild(empty);
  }

  activeIdx = 0;
  updateActive();
}

function updateActive() {
  activeFlat.forEach((it, i) =>
    it.row.classList.toggle("active", i === activeIdx),
  );
  activeFlat[activeIdx]?.row.scrollIntoView({ block: "nearest" });
}

function selectResult(obj) {
  pickObject(obj);
  closeSearch();
}

function openSearch() {
  searchPanel.hidden = false;
  searchToggle.setAttribute("aria-expanded", "true");
  document.querySelector(".top-bar")?.classList.add("searching");
  currentCategory = null;
  searchInput.value = "";
  renderResults("");
}

function closeSearch() {
  searchPanel.hidden = true;
  searchToggle.setAttribute("aria-expanded", "false");
  document.querySelector(".top-bar")?.classList.remove("searching");
  searchInput.blur();
}

searchToggle.addEventListener("click", (e) => {
  e.stopPropagation();
  if (searchPanel.hidden) openSearch();
  else closeSearch();
});

searchClose.addEventListener("click", (e) => {
  e.stopPropagation();
  e.preventDefault();
  closeSearch();
});

searchInput.addEventListener("input", () => renderResults(searchInput.value));

searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (currentCategory != null) {
      currentCategory = null;
      searchInput.value = "";
      renderCategoryPicker();
    } else {
      closeSearch();
    }
    return;
  }
  if (!activeFlat.length) return;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    activeIdx = Math.min(activeIdx + 1, activeFlat.length - 1);
    updateActive();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    activeIdx = Math.max(activeIdx - 1, 0);
    updateActive();
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (activeFlat[activeIdx]) selectResult(activeFlat[activeIdx].obj);
  }
});

// Press '/' to open search from anywhere
window.addEventListener("keydown", (e) => {
  if (e.key === "/" && document.activeElement !== searchInput) {
    e.preventDefault();
    openSearch();
  }
});

// Click anywhere outside the search panel (and not on the toggle/close) closes it
document.addEventListener(
  "pointerdown",
  (e) => {
    if (searchPanel.hidden) return;
    if (e.target.closest(".search")) return;
    closeSearch();
  },
  true,
);

// --- Minimap ---
(() => {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const orbitsG = document.getElementById("minimap-orbits");
  const dotsG = document.getElementById("minimap-dots");

  // Build a list of bodies to show: sun + planets + dwarfs + black hole.
  // Moon is a child of Earth - skip to keep map readable.
  const bodies = [{ obj: sun, color: "#ffc04d", size: 3.2, isSun: true }];
  for (const p of planets) {
    const isDwarf = ["Ceres", "Pluto", "Haumea", "Makemake", "Eris"].includes(
      p.userData.name,
    );
    bodies.push({
      obj: p,
      color: "#" + p.material.color.getHexString(),
      size: isDwarf
        ? 1.2
        : p.userData.name === "Jupiter" || p.userData.name === "Saturn"
          ? 2.2
          : 1.7,
    });
  }
  bodies.push({
    obj: blackHole,
    color: "#000",
    stroke: "#ff7755",
    size: 2.2,
    isBH: true,
  });

  // Distance scaling - sqrt to fit Mercury (~20) and the black hole (~1100+) in the same map.
  // Map radius in svg units = 95 (viewBox is -110..110).
  const maxWorld = Math.max(
    ...bodies.map((b) => Math.hypot(b.obj.position.x, b.obj.position.z)),
  );
  const mapR = 95;
  const k = mapR / Math.sqrt(maxWorld);
  const project = (wx, wz) => {
    const r = Math.sqrt(Math.hypot(wx, wz)) * k;
    const a = Math.atan2(wz, wx);
    return [Math.cos(a) * r, Math.sin(a) * r];
  };

  // Orbit rings (one per body that orbits the sun)
  for (const b of bodies) {
    if (b.isSun) continue;
    const dist = Math.hypot(b.obj.position.x, b.obj.position.z);
    const r = Math.sqrt(dist) * k;
    const c = document.createElementNS(SVG_NS, "circle");
    c.setAttribute("cx", 0);
    c.setAttribute("cy", 0);
    c.setAttribute("r", r);
    c.setAttribute("class", "orbit");
    orbitsG.appendChild(c);
  }

  // Dots
  const dotEls = [];
  for (const b of bodies) {
    const g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("class", "dot-group");

    const dot = document.createElementNS(SVG_NS, "circle");
    dot.setAttribute("class", "dot");
    dot.setAttribute("r", b.size);
    dot.setAttribute("fill", b.color);
    if (b.stroke) {
      dot.setAttribute("stroke", b.stroke);
      dot.setAttribute("stroke-width", 0.6);
    }
    dot.addEventListener("click", (e) => {
      e.stopPropagation();
      pickObject(b.obj);
    });

    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("class", "label");
    label.setAttribute("y", -b.size - 2);
    label.textContent = b.obj.userData.name;

    g.appendChild(dot);
    g.appendChild(label);
    dotsG.appendChild(g);
    dotEls.push({ b, g, dot, label });
  }

  // Update each frame
  function updateMinimap() {
    for (const { b, g, dot } of dotEls) {
      // Use world position so moons/orbits resolve correctly
      const wp = new THREE.Vector3();
      b.obj.getWorldPosition(wp);
      const [x, y] = project(wp.x, wp.z);
      g.setAttribute("transform", `translate(${x.toFixed(2)},${y.toFixed(2)})`);
      dot.classList.toggle("focused", zoomedOn === b.obj);
    }
    requestAnimationFrame(updateMinimap);
  }
  updateMinimap();

  // --- Click / drag on minimap to pan the camera in world ---
  const svg = document.getElementById("minimap-svg");

  function svgPointFromEvent(e) {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const local = pt.matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
  }

  function svgToWorld(sx, sy) {
    // inverse of project(): svg radius = sqrt(world_r) * k → world_r = (svg_r / k)^2
    const svgR = Math.hypot(sx, sy);
    const a = Math.atan2(sy, sx);
    const worldR = Math.pow(svgR / k, 2);
    return new THREE.Vector3(Math.cos(a) * worldR, 0, Math.sin(a) * worldR);
  }

  function panTo(target, instant = false) {
    // Cancel any follow / zoom-in
    followObj = null;
    zoomedOn = null;
    backBtn.hidden = true;
    infoToggle.hidden = true;
    infoPanel.hidden = true;

    const dist = camera.position.distanceTo(controls.target);
    const dir = new THREE.Vector3()
      .subVectors(camera.position, controls.target)
      .normalize();
    const newCamPos = target.clone().add(dir.multiplyScalar(dist));

    if (instant) {
      controls.target.copy(target);
      camera.position.copy(newCamPos);
      controls.update();
      return;
    }

    camTween.fromPos.copy(camera.position);
    camTween.fromTarget.copy(controls.target);
    camTween.toTarget.copy(target);
    camTween.toPos.copy(newCamPos);
    camTween.t = 0;
    camTween.dur = 0.6;
    camTween.active = true;
    controls.enabled = false;
  }

  let dragging = false;
  let didDrag = false;

  svg.addEventListener("pointerdown", (e) => {
    // If clicking directly on a dot, let its handler win (calls pickObject)
    if (e.target.classList && e.target.classList.contains("dot")) return;
    e.preventDefault();
    dragging = true;
    didDrag = false;
    svg.setPointerCapture(e.pointerId);
    const p = svgPointFromEvent(e);
    if (p) panTo(svgToWorld(p.x, p.y), true);
  });

  svg.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    didDrag = true;
    const p = svgPointFromEvent(e);
    if (p) panTo(svgToWorld(p.x, p.y), true);
  });

  svg.addEventListener("pointerup", (e) => {
    if (dragging) {
      dragging = false;
      try {
        svg.releasePointerCapture(e.pointerId);
      } catch (_) {}
    }
  });
  svg.addEventListener("pointercancel", () => {
    dragging = false;
  });
})();

// ===== Mission cards intro: wire up per-card actions =====
let showIntro = () => {};
{
  const original = document.getElementById("mission-intro");
  const introTemplate = original ? original.outerHTML : null;

  function setupIntro(intro) {
    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      intro.classList.add("dismissed");
      setTimeout(() => intro.remove(), 650);
    };

    const runAction = (action) => {
      if (action === "planet") {
        pickObject(earth);
      } else if (action === "moon") {
        pickObject(moon);
      } else if (action === "blackhole") {
        pickObject(blackHole);
      } else if (action === "quiz") {
        const names = Object.keys(QUIZZES);
        const pickName = names[Math.floor(Math.random() * names.length)];
        const target = clickables.find((o) => o.userData.name === pickName);
        if (target) pickObject(target);
        setTimeout(() => openQuiz(pickName), 60);
      }
      dismiss();
    };

    intro.querySelectorAll(".mission-card").forEach((card) => {
      card.addEventListener("click", (e) => {
        e.stopPropagation();
        runAction(card.dataset.action);
      });
    });

    const goBtn = intro.querySelector("#mission-go");
    if (goBtn) {
      goBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        dismiss();
      });
    }
    const skipBtn = intro.querySelector("#mission-skip");
    if (skipBtn) {
      skipBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        dismiss();
      });
    }

    intro.addEventListener("click", dismiss);
  }

  if (original) setupIntro(original);

  showIntro = () => {
    if (!introTemplate) return;
    const existing = document.getElementById("mission-intro");
    if (existing) existing.remove();
    document.body.insertAdjacentHTML("afterbegin", introTemplate);
    const fresh = document.getElementById("mission-intro");
    if (fresh) setupIntro(fresh);
  };
}

// ===== Sequential planet tour =====
const tour = (function () {
  const bar = document.getElementById("tour-bar");
  const prevBtn = document.getElementById("tour-prev");
  const nextBtn = document.getElementById("tour-next");
  const exitBtn = document.getElementById("tour-exit");

  const TOUR_LIST = [
    { name: "Sun",     obj: () => sun },
    { name: "Mercury", obj: () => mercury },
    { name: "Venus",   obj: () => venus },
    { name: "Earth",   obj: () => earth },
    { name: "Mars",    obj: () => mars },
    { name: "Jupiter", obj: () => jupiter },
    { name: "Saturn",  obj: () => saturn },
    { name: "Uranus",  obj: () => uranus },
    { name: "Neptune", obj: () => neptune },
  ];

  const state = { active: false, idx: 0, suppressExit: false };

  function render() {
    if (!state.active) return;
    prevBtn.disabled = state.idx === 0;
    nextBtn.disabled = state.idx === TOUR_LIST.length - 1;
  }

  function goToCurrent() {
    const entry = TOUR_LIST[state.idx];
    const obj = entry.obj();
    if (!obj) return;
    state.suppressExit = true;
    pickObject(obj);
    setTimeout(() => { state.suppressExit = false; }, 50);
    render();
  }

  function start(idx) {
    state.active = true;
    state.idx = Math.max(0, Math.min(TOUR_LIST.length - 1, idx || 0));
    bar.hidden = false;
    goToCurrent();
  }

  function next() {
    if (state.idx >= TOUR_LIST.length - 1) {
      exit();
      flyHome();
      return;
    }
    state.idx += 1;
    goToCurrent();
  }

  function prev() {
    if (state.idx <= 0) return;
    state.idx -= 1;
    goToCurrent();
  }

  function exit() {
    if (!state.active) return;
    state.active = false;
    bar.hidden = true;
  }

  prevBtn.addEventListener("click", (e) => { e.stopPropagation(); prev(); });
  nextBtn.addEventListener("click", (e) => { e.stopPropagation(); next(); });
  exitBtn.addEventListener("click", (e) => { e.stopPropagation(); exit(); flyHome(); });

  return {
    get active() { return state.active; },
    get suppressExit() { return state.suppressExit; },
    start, next, prev, exit,
  };
})();

// Auto-exit tour if the user navigates somewhere outside the planned sequence
const _origPickObject = pickObject;
pickObject = function (obj) {
  if (tour.active && !tour.suppressExit) tour.exit();
  if (typeof exitGalaxyMode === "function") exitGalaxyMode();
  return _origPickObject(obj);
};

// Galaxy view button
(function wireGalaxy() {
  const btn = document.getElementById("galaxy-btn");
  if (btn) btn.addEventListener("click", (e) => { e.stopPropagation(); flyToGalaxyView(); });

  const learn = document.getElementById("galaxy-learn");
  if (learn) {
    learn.addEventListener("click", (e) => {
      e.stopPropagation();
      openMilkyWayInfo();
    });
    learn.addEventListener("pointerdown", (e) => e.stopPropagation());
  }

  // Don't let clicks on the info panel close the galaxy view
  const ip = document.getElementById("info-panel");
  if (ip) ip.addEventListener("pointerdown", (e) => e.stopPropagation());
})();

// Astronaut / ISS view buttons
(function wireIss() {
  const enter = document.getElementById("iss-btn");
  const exit = document.getElementById("iss-exit");
  if (enter) {
    enter.addEventListener("click", (e) => { e.stopPropagation(); enterIssMode(); });
    enter.addEventListener("pointerdown", (e) => e.stopPropagation());
  }
  if (exit) {
    exit.addEventListener("click", (e) => { e.stopPropagation(); exitIssMode(); });
    exit.addEventListener("pointerdown", (e) => e.stopPropagation());
  }
})();

// Wrap pickObject again so clicking a planet from ISS view exits the station first
const _pickBeforeIss = pickObject;
pickObject = function (obj) {
  if (issMode) exitIssMode();
  return _pickBeforeIss(obj);
};

// Home button should also exit ISS mode
(function wireHomeIssExit() {
  const home = document.getElementById("home-btn");
  if (home) home.addEventListener("click", () => { if (issMode) exitIssMode(); }, true);
})();

// Re-wire the "Visit every planet" mission card to start the tour
// (document-level capture so it survives showIntro() recreating the cards)
document.addEventListener(
  "click",
  (e) => {
    const card = e.target.closest && e.target.closest('.mission-card[data-action="planet"]');
    if (!card) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    const intro = document.getElementById("mission-intro");
    if (intro) {
      intro.classList.add("dismissed");
      setTimeout(() => intro.remove(), 650);
    }
    tour.start(0);
  },
  true,
);
