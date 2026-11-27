// app.js — 360° Skybox, Pin-Drop Investigation, Tech Roll Reveal, Acquired Object Showcase & 3D WebXR Visor
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
const tts = new ElevenLabsClient({ onStatus: (msg) => { statusEl.textContent = msg; } });

const gameState = { location: null, character: null, level: 1, activePinDir: null };

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
renderer.domElement.addEventListener("pointerdown", (e) => { isDragging = true; prevX = e.clientX; prevY = e.clientY; });
window.addEventListener("pointermove", (e) => {
  if (!isDragging || renderer.xr.isPresenting) return;
  lon += (prevX - e.clientX) * 0.22;
  lat = Math.max(-85, Math.min(85, lat + (e.clientY - prevY) * 0.22));
  prevX = e.clientX; prevY = e.clientY;
});
window.addEventListener("pointerup", () => { isDragging = false; });
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

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

// --- 3. Pin-Based Skill Action Handler (with Tech Reveal + Acquired Object Showcase) ---
async function executePinAction(skill) {
  const result =
    skill === "Investigation"
      ? dm.investigatePin({ pinDir: gameState.activePinDir, character: gameState.character, level: gameState.level })
      : dm.resolvePinAction({ skill, pinDir: gameState.activePinDir, character: gameState.character, level: gameState.level });

  // Show brief scanning state on 3D VR HUD while desktop reveal animation runs
  hotspots.updateVRHud(`SCANNING ${skill.toUpperCase()}...`, dm.vitals, "Decrypting neural telemetry...");

  await visorHud.showRollResult(result);

  if (skill === "Investigation" && result.success && result.poi) {
    hotspots.markDiscoveredPOI(result.poi);
    visorHud.setPinStatus(`TARGET LOCKED: ${result.poi.label} — Select Hack or Attack.`);
  } else if (skill === "Investigation" && result.burnedPinDir) {
    hotspots.markBurnedSpot(result.burnedPinDir);
  }

  visorHud.updateVitals(result.vitals);

  const vrHeadline = result.autofail
    ? `${skill.toUpperCase()} — AUTOFAIL`
    : `${skill.toUpperCase()}: ${result.total} vs DC ${result.dc} (${result.success ? "SUCCESS" : "FAIL"})`;
  hotspots.updateVRHud(vrHeadline, result.vitals, result.narrative);

  // If a new object was acquired, pop open the Inspect Entity Overlay with its stats & add to Quick Inspect
  if (result.acquiredItem) {
    visorHud.addGearPill(result.acquiredItem, true);
    await runInspect(result.acquiredItem);
    statusEl.textContent = `ACQUIRED: ${result.acquiredItem} — Stats displayed & added to Quick Inspect.`;
  }

  await tts.speak(result.narrative, {
    role: "Narrator",
    speaker: "narrator",
    intent: result.cacheIntent,
    cacheOnly: !visorHud.liveVoiceEnabled,
  });
}

// --- 4. Hotspots (Pin-Drop + 3D VR HUD) & Desktop Visor HUD ---
const hotspots = new HotspotManager(scene, camera, renderer, {
  onPinDropped: (pinDir, yaw, pitch) => {
    gameState.activePinDir = pinDir;
    const msg = `PIN DROPPED (Yaw ${yaw}°, Pitch ${pitch}°) — Choose Investigate, Hack, or Attack.`;
    visorHud.setPinStatus(msg);
    hotspots.updateVRHud(`Pin Set (Yaw ${yaw}°, Pitch ${pitch}°)`, dm.vitals, "Select INVESTIGATE, HACK, or ATTACK below.");
  },
  onVrAction: (skill) => executePinAction(skill),
});

const visorHud = new VisorHud({
  onAction: (skill) => executePinAction(skill),
  onInspect: (name) => runInspect(name),
  onVoiceCommand: (transcript) => {
    const cmd = transcript.toLowerCase();
    statusEl.textContent = `Voice Command: "${transcript}"`;
    if (cmd.includes("inspect ") || cmd.includes("show ")) {
      runInspect(cmd.replace(/^.*?(inspect|show)\s+/i, "").trim());
    } else if (cmd.includes("hack")) {
      executePinAction("Hack");
    } else if (cmd.includes("attack") || cmd.includes("shoot") || cmd.includes("strike")) {
      executePinAction("Attack");
    } else {
      executePinAction("Investigation");
    }
  },
});

// --- 5. Load 360° Skybox & Reset Hidden POIs ---
function loadLocationSkybox(location) {
  gameState.location = location;
  gameState.activePinDir = null;
  locLabelEl.textContent = location.name;

  hotspots.clearSceneMarkers();
  dm.initLocationPOIs(location);
  visorHud.setPinStatus("PIN: Click anywhere in the 360° scene to drop a target pin.");
  hotspots.updateVRHud(`Scene: ${location.name}`, dm.vitals, "Point laser & pull trigger to drop a search pin.");

  if (!location.image_360) {
    skyMat.map = null; skyMat.color.setHex(0x070d1f); skyMat.needsUpdate = true;
    fallbackGrid.visible = true;
    statusEl.textContent = `Loaded ${location.name} (neural grid active — click to drop a pin).`;
    return;
  }

  statusEl.textContent = `Loading 360° skybox for ${location.name}...`;
  textureLoader.load(
    location.image_360,
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      skyMat.map = tex; skyMat.color.setHex(0xffffff); skyMat.opacity = 0; skyMat.needsUpdate = true;
      fallbackGrid.visible = false;
      const start = performance.now();
      function fade(now) {
        const t = Math.min(1, (now - start) / 500);
        skyMat.opacity = t;
        if (t < 1) requestAnimationFrame(fade);
      }
      requestAnimationFrame(fade);
      statusEl.textContent = `360° Scene Active: ${location.name} — Click a spot to drop a pin, then Investigate.`;
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
    camera.lookAt(500 * Math.sin(phi) * Math.cos(theta), 500 * Math.cos(phi), 500 * Math.sin(phi) * Math.sin(theta));
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
  await tts.speak("", { role: "Narrator", speaker: "narrator", intent: "intro", cacheOnly: true });
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
