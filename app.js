// app.js — Phase 4 Playable Vertical Slice (360° Skybox, Hotspots, Visor HUD, AI DM & Cache-First Audio)
import * as THREE from "three";
import { VRButton } from "three/addons/webxr/VRButton.js";
import { AssetResolver } from "./assetResolver.js";
import { EntityOverlay } from "./entityOverlay.js";
import { ElevenLabsClient } from "./elevenLabsClient.js";
import { CharacterSelect } from "./characterSelect.js";
import { HotspotManager } from "./hotspotManager.js";
import { VisorHud } from "./visorHud.js";
import { DMEngine } from "./dmEngine.js";

const statusEl = document.getElementById("hud-status");
const locLabelEl = document.getElementById("hud-location");
const charLabelEl = document.getElementById("hud-character");
const inspectInput = document.getElementById("hud-inspect-input");

const resolver = new AssetResolver();
const overlay = new EntityOverlay(resolver);
const dm = new DMEngine();
const tts = new ElevenLabsClient({
  onStatus: (msg) => {
    statusEl.textContent = msg;
  },
});

const gameState = { location: null, character: null, level: 1 };

// --- 1. Three.js Scene, Camera & WebXR Renderer ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050811);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1100);
camera.position.set(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.getElementById("viewport").appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

const skyGeo = new THREE.SphereGeometry(500, 60, 40);
skyGeo.scale(-1, 1, 1);
const skyMat = new THREE.MeshBasicMaterial({ color: 0x0b1120, transparent: true, opacity: 1 });
scene.add(new THREE.Mesh(skyGeo, skyMat));

const fallbackGrid = new THREE.GridHelper(60, 40, 0x00f0ff, 0x1e293b);
fallbackGrid.position.y = -4;
fallbackGrid.visible = false;
scene.add(fallbackGrid);

const textureLoader = new THREE.TextureLoader();
textureLoader.setCrossOrigin("anonymous");

// --- 2. Desktop Mouse / Touch 360° Drag Look ---
let isDragging = false, prevX = 0, prevY = 0, lon = 0, lat = 0;

renderer.domElement.addEventListener("pointerdown", (e) => {
  isDragging = true;
  prevX = e.clientX;
  prevY = e.clientY;
});
window.addEventListener("pointermove", (e) => {
  if (!isDragging || renderer.xr.isPresenting) return;
  lon += (prevX - e.clientX) * 0.22;
  lat = Math.max(-85, Math.min(85, lat + (e.clientY - prevY) * 0.22));
  prevX = e.clientX;
  prevY = e.clientY;
});
window.addEventListener("pointerup", () => { isDragging = false; });
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- 3. Interactive Skill Check & Narration Handler ---
async function triggerSkillCheck(checkConfig) {
  const result = dm.resolveCheck({
    ...checkConfig,
    character: gameState.character,
    level: gameState.level,
  });

  visorHud.updateVitals(result.vitals);
  visorHud.showRollResult(result);

  if (visorHud.liveVoiceEnabled) {
    // Streams the custom outcome line via Cloudflare proxy (logs clip for archiving)
    await tts.speak(result.narrative, { role: "Narrator", speaker: "narrator" });
  } else {
    // 0 API calls: plays matching pre-downloaded success/failure clip from carbasset
    await tts.speak("", { role: "Narrator", speaker: "narrator", intent: result.cacheIntent });
  }
}

async function runInspect(query) {
  const q = String(query || inspectInput.value || "").trim();
  if (!q) return;
  inspectInput.value = q;
  try {
    await overlay.showTarget(q);
    statusEl.textContent = `Inspecting: ${q}`;
  } catch (err) {
    statusEl.textContent = err.message;
  }
}

// --- 4. Hotspots & Visor HUD ---
const hotspots = new HotspotManager(scene, camera, renderer, (hs) => {
  triggerSkillCheck({
    label: hs.label,
    skill: hs.skill,
    dc: hs.dc,
    successLine: hs.successLine,
    failLine: hs.failLine,
  });
});

const visorHud = new VisorHud({
  onAction: (skill) => {
    triggerSkillCheck({ label: `Quick ${skill}`, skill, dc: 12 });
  },
  onInspect: (name) => runInspect(name),
  onVoiceCommand: (transcript) => {
    const cmd = transcript.toLowerCase();
    statusEl.textContent = `Voice Command: "${transcript}"`;
    if (cmd.includes("inspect ") || cmd.includes("show ")) {
      runInspect(cmd.replace(/^.*?(inspect|show)\s+/i, "").trim());
    } else if (cmd.includes("hack")) {
      triggerSkillCheck({ label: "Voice Hack", skill: "Hack", dc: 13 });
    } else if (cmd.includes("attack") || cmd.includes("shoot") || cmd.includes("strike")) {
      triggerSkillCheck({ label: "Voice Attack", skill: "Attack", dc: 14 });
    } else {
      triggerSkillCheck({ label: "Voice Investigate", skill: "Investigation", dc: 12 });
    }
  },
});

// --- 5. Load 360° Skybox + Hotspots ---
function loadLocationSkybox(location) {
  gameState.location = location;
  locLabelEl.textContent = location.name;
  hotspots.setHotspots(dm.getHotspotsForLocation(location));

  if (!location.image_360) {
    skyMat.map = null;
    skyMat.color.setHex(0x070d1f);
    skyMat.needsUpdate = true;
    fallbackGrid.visible = true;
    statusEl.textContent = `Loaded ${location.name} (neural grid + 3 interactive hotspots).`;
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

      const start = performance.now();
      function fade(now) {
        const t = Math.min(1, (now - start) / 500);
        skyMat.opacity = t;
        if (t < 1) requestAnimationFrame(fade);
      }
      requestAnimationFrame(fade);
      statusEl.textContent = `360° Scene Active: ${location.name} — Click glowing reticles or use the Visor HUD.`;
    },
    undefined,
    () => {
      fallbackGrid.visible = true;
      statusEl.textContent = `Could not load 360° image for ${location.name}; neural grid active.`;
    }
  );
}

// --- 6. Render Loop ---
const clock = new THREE.Clock();
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
  hotspots.update(clock.getElapsedTime());
  renderer.render(scene, camera);
});

// --- 7. Character Select Launch ---
const charSelect = new CharacterSelect(resolver, async ({ location, character, level }) => {
  gameState.character = character;
  gameState.level = level;

  const cls = character.class || character.character_class || "Operative";
  charLabelEl.textContent = `${character.name} • ${cls} (Lv. ${level})`;

  const vitals = dm.initCharacterVitals(character, level);
  visorHud.updateVitals(vitals);
  visorHud.setGearPills(character);
  visorHud.show();

  loadLocationSkybox(location);
  await tts.speak("", { role: "Narrator", speaker: "narrator", intent: "intro" });
});

document.getElementById("hud-inspect-btn").onclick = () => runInspect();
inspectInput.addEventListener("keydown", (e) => { if (e.key === "Enter") runInspect(); });
document.getElementById("hud-menu-btn").onclick = () => charSelect.show();

window.C2185 = { gameState, resolver, overlay, tts, dm, hotspots, visorHud, loadLocationSkybox };

async function boot() {
  await Promise.all([charSelect.init(), tts.init(true)]);
  await tts.fetchQuotaStatus();
}
boot();
