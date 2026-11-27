// app.js — Phase 4 Core Shell (Three.js 360° Skybox, WebXR, Character Select & Cache-First Audio)
import * as THREE from "three";
import { VRButton } from "three/addons/webxr/VRButton.js";
import { AssetResolver } from "./assetResolver.js";
import { EntityOverlay } from "./entityOverlay.js";
import { ElevenLabsClient } from "./elevenLabsClient.js";
import { CharacterSelect } from "./characterSelect.js";

const statusEl = document.getElementById("hud-status");
const locLabelEl = document.getElementById("hud-location");
const charLabelEl = document.getElementById("hud-character");
const inspectInput = document.getElementById("hud-inspect-input");

const resolver = new AssetResolver();
const overlay = new EntityOverlay(resolver);
const tts = new ElevenLabsClient({
  onStatus: (msg) => {
    statusEl.textContent = msg;
  },
});

const gameState = {
  location: null,
  character: null,
  level: 1,
};

// --- 1. Three.js Scene, Camera & WebXR Renderer ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050811);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1100
);
camera.position.set(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.getElementById("viewport").appendChild(renderer.domElement);

// Add WebXR "ENTER VR" button (works on Meta Quest 3 & Samsung Galaxy XR)
const vrBtn = VRButton.createButton(renderer);
document.body.appendChild(vrBtn);

// Inverted 360-degree equirectangular skybox sphere
const skyGeo = new THREE.SphereGeometry(500, 60, 40);
skyGeo.scale(-1, 1, 1);
const skyMat = new THREE.MeshBasicMaterial({ color: 0x0b1120, transparent: true, opacity: 1 });
const skyDome = new THREE.Mesh(skyGeo, skyMat);
scene.add(skyDome);

// Subtle fallback wireframe grid (visible only when a location has no 360 image yet)
const fallbackGrid = new THREE.GridHelper(60, 40, 0x00f0ff, 0x1e293b);
fallbackGrid.position.y = -4;
fallbackGrid.visible = false;
scene.add(fallbackGrid);

const textureLoader = new THREE.TextureLoader();
textureLoader.setCrossOrigin("anonymous");

// --- 2. Desktop Mouse / Touch 360° Drag Look ---
let isDragging = false;
let prevX = 0;
let prevY = 0;
let lon = 0;
let lat = 0;

renderer.domElement.addEventListener("pointerdown", (e) => {
  isDragging = true;
  prevX = e.clientX;
  prevY = e.clientY;
});

window.addEventListener("pointermove", (e) => {
  if (!isDragging || renderer.xr.isPresenting) return;
  lon += (prevX - e.clientX) * 0.22;
  lat += (e.clientY - prevY) * 0.22;
  lat = Math.max(-85, Math.min(85, lat));
  prevX = e.clientX;
  prevY = e.clientY;
});

window.addEventListener("pointerup", () => {
  isDragging = false;
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- 3. Load 360° Location Texture with Smooth Fade ---
function loadLocationSkybox(location) {
  gameState.location = location;
  locLabelEl.textContent = location.name;

  if (!location.image_360) {
    skyMat.map = null;
    skyMat.color.setHex(0x070d1f);
    skyMat.needsUpdate = true;
    fallbackGrid.visible = true;
    statusEl.textContent = `Loaded ${location.name} (no 360° texture yet — showing neural grid).`;
    return;
  }

  statusEl.textContent = `Loading 360° skybox for ${location.name}...`;
  textureLoader.load(
    location.image_360,
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      skyMat.map = tex;
      skyMat.color.setHex(0xffffff);
      skyMat.opacity = 0;
      skyMat.needsUpdate = true;
      fallbackGrid.visible = false;

      // 0.5-second fade-in transition
      const start = performance.now();
      function fade(now) {
        const t = Math.min(1, (now - start) / 500);
        skyMat.opacity = t;
        if (t < 1) requestAnimationFrame(fade);
      }
      requestAnimationFrame(fade);
      statusEl.textContent = `360° Scene Active: ${location.name} (drag to look around).`;
    },
    undefined,
    () => {
      fallbackGrid.visible = true;
      statusEl.textContent = `Could not load 360° image for ${location.name}; neural grid active.`;
    }
  );
}

// --- 4. Render Loop (Desktop + WebXR) ---
renderer.setAnimationLoop(() => {
  if (!renderer.xr.isPresenting) {
    const phi = THREE.MathUtils.degToRad(90 - lat);
    const theta = THREE.MathUtils.degToRad(lon);
    camera.lookAt(
      500 * Math.sin(phi) * Math.cos(theta),
      500 * Math.cos(phi),
      500 * Math.sin(phi) * Math.sin(theta)
    );
  }
  renderer.render(scene, camera);
});

// --- 5. Character Select Launch & HUD Controls ---
const charSelect = new CharacterSelect(resolver, async ({ location, character, level }) => {
  gameState.character = character;
  gameState.level = level;

  const cls = character.class || character.character_class || "Operative";
  charLabelEl.textContent = `${character.name} • ${cls} (Lv. ${level})`;

  loadLocationSkybox(location);

  // Trigger cache-first Narrator intro (0 ElevenLabs API calls on cache hit)
  await tts.speak("", { role: "Narrator", speaker: "narrator", intent: "intro" });
});

async function runInspect() {
  const q = inspectInput.value.trim();
  if (!q) return;
  try {
    await overlay.showTarget(q);
    statusEl.textContent = `Inspecting: ${q}`;
  } catch (err) {
    statusEl.textContent = err.message;
  }
}

document.getElementById("hud-inspect-btn").onclick = runInspect;
inspectInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") runInspect();
});
document.getElementById("hud-menu-btn").onclick = () => charSelect.show();

// Expose state cleanly for upcoming Tasks 4.3–4.5 (Hotspots, Visor HUD, AI DM)
window.C2185 = { gameState, resolver, overlay, tts, scene, camera, loadLocationSkybox };

async function boot() {
  await Promise.all([charSelect.init(), tts.init(true)]);
  await tts.fetchQuotaStatus();
}

boot();
