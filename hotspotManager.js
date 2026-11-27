// hotspotManager.js — 360° Pin-Drop Radius Rings, Discovered Markers & 3D WebXR VR Visor HUD
import * as THREE from "three";

const PIN_RADIUS = 38;
const OUTER_RING_WORLD = Math.tan(THREE.MathUtils.degToRad(35)) * PIN_RADIUS * 0.42;
const INNER_RING_WORLD = Math.tan(THREE.MathUtils.degToRad(10)) * PIN_RADIUS * 0.42;

function createPinTexture(color = "#00f0ff", symbol = "") {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 128;
  const ctx = c.getContext("2d");
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(64, 64, 42, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = color;
  if (symbol) {
    ctx.font = "bold 52px system-ui, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(symbol, 64, 66);
  } else {
    ctx.beginPath(); ctx.arc(64, 64, 10, 0, Math.PI * 2); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createButtonTexture(label, accent = "#00f0ff") {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 96;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#080e1c";
  ctx.fillRect(0, 0, 256, 96);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 6;
  ctx.strokeRect(4, 4, 248, 88);
  ctx.fillStyle = "#e2f1ff";
  ctx.font = "bold 30px system-ui, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(label, 128, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class HotspotManager {
  constructor(scene, camera, renderer, { onPinDropped, onVrAction }) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.onPinDropped = onPinDropped || (() => {});
    this.onVrAction = onVrAction || (() => {});

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.downPos = { x: 0, y: 0 };

    // Invisible sphere used for 360° point-and-click raycasting
    const hitGeo = new THREE.SphereGeometry(PIN_RADIUS, 32, 24);
    hitGeo.scale(-1, 1, 1);
    this.hitSphere = new THREE.Mesh(hitGeo, new THREE.MeshBasicMaterial({ visible: false }));
    this.scene.add(this.hitSphere);

    this.markersGroup = new THREE.Group();
    this.scene.add(this.markersGroup);
    this.pinGroup = null;
    this.activePinDir = null;

    this._buildVRHud();
    this._bindDesktopEvents();
    this._bindWebXREvents();
  }

  clearSceneMarkers() {
    while (this.markersGroup.children.length) {
      this.markersGroup.remove(this.markersGroup.children[0]);
    }
    if (this.pinGroup) {
      this.scene.remove(this.pinGroup);
      this.pinGroup = null;
    }
    this.activePinDir = null;
  }

  dropPinAtDirection(dirVec) {
    const unit = dirVec.clone().normalize();
    this.activePinDir = { x: unit.x, y: unit.y, z: unit.z };

    if (this.pinGroup) this.scene.remove(this.pinGroup);
    this.pinGroup = new THREE.Group();
    this.pinGroup.position.copy(unit).multiplyScalar(PIN_RADIUS - 0.5);
    this.pinGroup.lookAt(0, 0, 0);

    // Outer 35° rim ring (dashed/amber)
    const outerGeo = new THREE.RingGeometry(OUTER_RING_WORLD - 0.25, OUTER_RING_WORLD, 48);
    const outerMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
    this.pinGroup.add(new THREE.Mesh(outerGeo, outerMat));

    // Inner 10° bullseye ring (cyan)
    const innerGeo = new THREE.RingGeometry(INNER_RING_WORLD - 0.22, INNER_RING_WORLD, 36);
    const innerMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    this.pinGroup.add(new THREE.Mesh(innerGeo, innerMat));

    // Center pin dot
    const dotGeo = new THREE.CircleGeometry(0.65, 20);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, side: THREE.DoubleSide });
    this.pinGroup.add(new THREE.Mesh(dotGeo, dotMat));

    this.scene.add(this.pinGroup);

    const pitch = Math.round(THREE.MathUtils.radToDeg(Math.asin(Math.max(-1, Math.min(1, unit.y)))));
    const yaw = Math.round(THREE.MathUtils.radToDeg(Math.atan2(unit.z, unit.x)));
    this.onPinDropped(this.activePinDir, yaw, pitch);
  }

  markDiscoveredPOI(poi) {
    const mat = new THREE.SpriteMaterial({ map: createPinTexture(poi.color || "#00f0ff", "!"), transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(poi.dir.x, poi.dir.y, poi.dir.z).multiplyScalar(PIN_RADIUS - 1);
    sprite.scale.set(3.8, 3.8, 1);
    this.markersGroup.add(sprite);
  }

  markBurnedSpot(pinDir) {
    if (!pinDir) return;
    const mat = new THREE.SpriteMaterial({ map: createPinTexture("#ff2a85", "X"), transparent: true, opacity: 0.65, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(pinDir.x, pinDir.y, pinDir.z).multiplyScalar(PIN_RADIUS - 1);
    sprite.scale.set(3.0, 3.0, 1);
    this.markersGroup.add(sprite);
  }

  // --- 3D Spatial WebXR Visor Panel (visible only inside Quest / Galaxy XR VR sessions) ---
  _buildVRHud() {
    this.vrGroup = new THREE.Group();
    this.vrGroup.position.set(0, -0.55, -1.6);
    this.vrGroup.rotation.x = -0.22;
    this.vrGroup.visible = false;

    this.vrCanvas = document.createElement("canvas");
    this.vrCanvas.width = 768; this.vrCanvas.height = 240;
    this.vrTex = new THREE.CanvasTexture(this.vrCanvas);
    this.vrTex.colorSpace = THREE.SRGBColorSpace;

    const screenMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.15, 0.36),
      new THREE.MeshBasicMaterial({ map: this.vrTex, transparent: true })
    );
    screenMesh.position.set(0, 0.14, 0);
    this.vrGroup.add(screenMesh);

    this.vrButtons = [];
    const defs = [
      { label: "INVESTIGATE", skill: "Investigation", x: -0.36, color: "#00f0ff" },
      { label: "HACK", skill: "Hack", x: 0, color: "#fbbf24" },
      { label: "ATTACK", skill: "Attack", x: 0.36, color: "#ff2a85" },
    ];
    defs.forEach((d) => {
      const btn = new THREE.Mesh(
        new THREE.PlaneGeometry(0.32, 0.12),
        new THREE.MeshBasicMaterial({ map: createButtonTexture(d.label, d.color) })
      );
      btn.position.set(d.x, -0.14, 0.01);
      btn.userData = { vrSkill: d.skill };
      this.vrGroup.add(btn);
      this.vrButtons.push(btn);
    });

    this.scene.add(this.vrGroup);
    this.updateVRHud("Point laser & pull trigger to drop a pin.", { hp: 16, maxHp: 16, stress: 0, maxStress: 10, wonlongs: 750 });
  }

  updateVRHud(headline, vitals, subline = "") {
    const ctx = this.vrCanvas.getContext("2d");
    ctx.fillStyle = "rgba(8, 14, 28, 0.92)";
    ctx.fillRect(0, 0, 768, 240);
    ctx.strokeStyle = "#00f0ff";
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 760, 232);

    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 22px monospace";
    ctx.fillText(
      `HP ${vitals.hp}/${vitals.maxHp}   STRESS ${vitals.stress}/${vitals.maxStress}   ₩${vitals.wonlongs}`,
      24, 42
    );

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 24px system-ui, sans-serif";
    ctx.fillText(String(headline || "").slice(0, 56), 24, 96);

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "20px system-ui, sans-serif";
    const text = String(subline || "");
    ctx.fillText(text.slice(0, 66), 24, 145);
    ctx.fillText(text.slice(66, 132), 24, 178);
    this.vrTex.needsUpdate = true;
  }

  _bindDesktopEvents() {
    const dom = this.renderer.domElement;
    dom.addEventListener("pointerdown", (e) => {
      this.downPos = { x: e.clientX, y: e.clientY };
    });
    dom.addEventListener("pointerup", (e) => {
      if (this.renderer.xr.isPresenting) return;
      if (Math.hypot(e.clientX - this.downPos.x, e.clientY - this.downPos.y) > 6) return;

      this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
      this.raycaster.setFromCamera(this.pointer, this.camera);

      const hits = this.raycaster.intersectObject(this.hitSphere, false);
      if (hits.length) this.dropPinAtDirection(hits[0].point);
    });
  }

  _bindWebXREvents() {
    const tempMatrix = new THREE.Matrix4();
    const handleSelect = (ctrl) => {
      tempMatrix.identity().extractRotation(ctrl.matrixWorld);
      this.raycaster.ray.origin.setFromMatrixPosition(ctrl.matrixWorld);
      this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

      // 1. Check 3D VR HUD buttons first
      const btnHits = this.raycaster.intersectObjects(this.vrButtons, false);
      if (btnHits.length) {
        this.onVrAction(btnHits[0].object.userData.vrSkill);
        return;
      }
      // 2. Otherwise drop pin on the 360° dome
      const domeHits = this.raycaster.intersectObject(this.hitSphere, false);
      if (domeHits.length) this.dropPinAtDirection(domeHits[0].point);
    };

    const rayGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -12),
    ]);
    const rayMat = new THREE.LineBasicMaterial({ color: 0x00f0ff });

    [0, 1].forEach((idx) => {
      const ctrl = this.renderer.xr.getController(idx);
      ctrl.add(new THREE.Line(rayGeo, rayMat));
      ctrl.addEventListener("select", () => handleSelect(ctrl));
      this.scene.add(ctrl);
    });
  }

  update(timeSec) {
    this.vrGroup.visible = this.renderer.xr.isPresenting;
    if (this.pinGroup) {
      const s = 1 + Math.sin(timeSec * 4) * 0.04;
      this.pinGroup.scale.set(s, s, 1);
    }
  }
}
