// hotspotManager.js — 360° Pin-Drop Rings, Seated Grab-to-Spin, -45° VR HUD (Exact Shadow + 3D Laser Beams) & VR Item Showcase
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
  ctx.fillStyle = "#0b1326";
  ctx.fillRect(0, 0, 256, 96);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 6;
  ctx.strokeRect(4, 4, 248, 88);
  ctx.fillStyle = "#e2f1ff";
  ctx.font = "bold 28px system-ui, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(label, 128, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function drawEyeButtonCanvas(canvas, isFullOpacity) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 180, 96);
  ctx.fillStyle = isFullOpacity ? "#0e223d" : "#0b1326";
  ctx.fillRect(0, 0, 180, 96);
  ctx.strokeStyle = isFullOpacity ? "#00f0ff" : "#38bdf8";
  ctx.lineWidth = 6;
  ctx.strokeRect(4, 4, 172, 88);

  ctx.strokeStyle = isFullOpacity ? "#00f0ff" : "#e2f1ff";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(46, 38);
  ctx.quadraticCurveTo(90, 12, 134, 38);
  ctx.quadraticCurveTo(90, 64, 46, 38);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(90, 38, 12, 0, Math.PI * 2);
  ctx.fillStyle = isFullOpacity ? "#00f0ff" : "#94a3b8";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(90, 38, 5, 0, Math.PI * 2);
  ctx.fillStyle = "#050811";
  ctx.fill();

  ctx.fillStyle = isFullOpacity ? "#00f0ff" : "#cbd5e1";
  ctx.font = "bold 18px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(isFullOpacity ? "100%" : "25%", 90, 76);
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 6) {
  const words = String(text || "").split(/\s+/);
  let line = "";
  let lineCount = 0;
  for (let i = 0; i < words.length; i++) {
    const testLine = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, x, y + lineCount * lineHeight);
      line = words[i];
      lineCount++;
      if (lineCount >= maxLines - 1) {
        const rest = [line, ...words.slice(i + 1)].join(" ");
        ctx.fillText(rest.slice(0, 44) + (rest.length > 44 ? "..." : ""), x, y + lineCount * lineHeight);
        return;
      }
    } else {
      line = testLine;
    }
  }
  if (line && lineCount < maxLines) {
    ctx.fillText(line, x, y + lineCount * lineHeight);
  }
}

export class HotspotManager {
  constructor(scene, worldGroup, camera, renderer, { onPinDropped, onVrAction }) {
    this.scene = scene;
    this.worldGroup = worldGroup;
    this.camera = camera;
    this.renderer = renderer;
    this.onPinDropped = onPinDropped || (() => {});
    this.onVrAction = onVrAction || (() => {});

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.downPos = { x: 0, y: 0 };

    const hitGeo = new THREE.SphereGeometry(PIN_RADIUS, 32, 24);
    hitGeo.scale(-1, 1, 1);
    this.hitSphere = new THREE.Mesh(hitGeo, new THREE.MeshBasicMaterial({ visible: false }));
    this.worldGroup.add(this.hitSphere);

    this.markersGroup = new THREE.Group();
    this.worldGroup.add(this.markersGroup);
    this.pinGroup = null;
    this.activePinDir = null;

    this.controllers = [];
    this.grabbingCtrl = null;
    this.lastGrabAngle = 0;
    this._vrFullOpacity = false;
    this._vrHudMaterials = [];
    this._vrHudHovered = false;
    this._hoveredBtn = null;

    this._vrScanInterval = null;
    this._inspectLoadId = 0;
    this._hudInitialized = false;
    this._upVec = new THREE.Vector3(0, 1, 0);
    this._tmpCamPos = new THREE.Vector3();
    this._tmpCamQuat = new THREE.Quaternion();
    this._tmpForward = new THREE.Vector3();
    this._tmpTargetPos = new THREE.Vector3();
    this._tmpLookMatrix = new THREE.Matrix4();
    this._tmpTargetQuat = new THREE.Quaternion();
    this._tmpCtrlPos = new THREE.Vector3();
    this._tmpRayMatrix = new THREE.Matrix4();

    this._buildVRHud();
    this._buildVRInspectCard();
    this._applyVROpacity();
    this._bindDesktopEvents();
    this._bindWebXREvents();
  }

  _registerHudMaterial(mat, baseMultiplier = 1.0) {
    mat.transparent = true;
    mat.depthTest = false;
    mat.depthWrite = false;
    mat.userData.baseOpacity = baseMultiplier;
    this._vrHudMaterials.push(mat);
    return mat;
  }

  _applyVROpacity() {
    const level = this._vrFullOpacity ? 1.0 : 0.25;
    for (const mat of this._vrHudMaterials) {
      mat.opacity = level * (mat.userData.baseOpacity ?? 1.0);
      mat.needsUpdate = true;
    }
    if (this._eyeCanvas && this._eyeTex) {
      drawEyeButtonCanvas(this._eyeCanvas, this._vrFullOpacity);
      this._eyeTex.needsUpdate = true;
    }
  }

  toggleVROpacity() {
    this._vrFullOpacity = !this._vrFullOpacity;
    this._applyVROpacity();
  }

  clearSceneMarkers() {
    while (this.markersGroup.children.length) {
      this.markersGroup.remove(this.markersGroup.children[0]);
    }
    if (this.pinGroup) {
      this.worldGroup.remove(this.pinGroup);
      this.pinGroup = null;
    }
    this.activePinDir = null;
    this.hideVRInspectCard();
  }

  dropPinAtWorldPoint(worldPoint) {
    const localPoint = this.worldGroup.worldToLocal(worldPoint.clone());
    const unit = localPoint.normalize();
    this.activePinDir = { x: unit.x, y: unit.y, z: unit.z };

    if (this.pinGroup) this.worldGroup.remove(this.pinGroup);
    this.pinGroup = new THREE.Group();
    this.pinGroup.position.copy(unit).multiplyScalar(PIN_RADIUS - 0.5);
    this.pinGroup.lookAt(0, 0, 0);

    const outerGeo = new THREE.RingGeometry(OUTER_RING_WORLD - 0.25, OUTER_RING_WORLD, 48);
    const outerMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
    const outerMesh = new THREE.Mesh(outerGeo, outerMat);
    outerMesh.renderOrder = 10;
    this.pinGroup.add(outerMesh);

    const innerGeo = new THREE.RingGeometry(INNER_RING_WORLD - 0.22, INNER_RING_WORLD, 36);
    const innerMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);
    innerMesh.renderOrder = 11;
    this.pinGroup.add(innerMesh);

    const dotGeo = new THREE.CircleGeometry(0.65, 20);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, side: THREE.DoubleSide });
    const dotMesh = new THREE.Mesh(dotGeo, dotMat);
    dotMesh.renderOrder = 12;
    this.pinGroup.add(dotMesh);

    this.worldGroup.add(this.pinGroup);

    const pitch = Math.round(THREE.MathUtils.radToDeg(Math.asin(Math.max(-1, Math.min(1, unit.y)))));
    const yaw = Math.round(THREE.MathUtils.radToDeg(Math.atan2(unit.z, unit.x)));
    this.onPinDropped(this.activePinDir, yaw, pitch);
  }

  markDiscoveredPOI(poi) {
    const mat = new THREE.SpriteMaterial({ map: createPinTexture(poi.color || "#00f0ff", "!"), transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(poi.dir.x, poi.dir.y, poi.dir.z).multiplyScalar(PIN_RADIUS - 1);
    sprite.scale.set(3.8, 3.8, 1);
    sprite.renderOrder = 20;
    this.markersGroup.add(sprite);
  }

  markBurnedSpot(pinDir) {
    if (!pinDir) return;
    const mat = new THREE.SpriteMaterial({ map: createPinTexture("#ff2a85", "X"), transparent: true, opacity: 0.65, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(pinDir.x, pinDir.y, pinDir.z).multiplyScalar(PIN_RADIUS - 1);
    sprite.scale.set(3.0, 3.0, 1);
    sprite.renderOrder = 20;
    this.markersGroup.add(sprite);
  }

  // --- -45° Always-On-Top Translucent 3D VR Visor HUD ---
  _buildVRHud() {
    this.vrGroup = new THREE.Group();
    this.vrGroup.visible = false;

    // Exact-dimension drop shadow offset tightly right & down (~2px visual offset)
    const shadowMat = this._registerHudMaterial(new THREE.MeshBasicMaterial({ color: 0x000000 }), 0.6);
    const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.20, 0.52), shadowMat);
    shadowPlane.position.set(0.008, 0.012, -0.029);
    shadowPlane.renderOrder = 900;
    this.vrGroup.add(shadowPlane);

    const bezelMat = this._registerHudMaterial(new THREE.MeshBasicMaterial({ color: 0x071022 }), 0.85);
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(1.20, 0.52, 0.02), bezelMat);
    bezel.position.set(0, 0.02, -0.018);
    bezel.renderOrder = 901;
    this.vrGroup.add(bezel);
    this.vrBackdropMesh = bezel;

    this.vrCanvas = document.createElement("canvas");
    this.vrCanvas.width = 768; this.vrCanvas.height = 256;
    this.vrTex = new THREE.CanvasTexture(this.vrCanvas);
    this.vrTex.colorSpace = THREE.SRGBColorSpace;

    const screenMat = this._registerHudMaterial(new THREE.MeshBasicMaterial({ map: this.vrTex }), 1.0);
    this.vrScreenMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.14, 0.36), screenMat);
    this.vrScreenMesh.position.set(0, 0.09, 0.004);
    this.vrScreenMesh.renderOrder = 902;
    this.vrGroup.add(this.vrScreenMesh);

    this.vrButtons = [];
    const defs = [
      { label: "INVESTIGATE", skill: "Investigation", x: -0.40, w: 0.30, color: "#00f0ff" },
      { label: "HACK", skill: "Hack", x: -0.09, w: 0.24, color: "#fbbf24" },
      { label: "ATTACK", skill: "Attack", x: 0.19, w: 0.24, color: "#ff2a85" },
    ];
    defs.forEach((d) => {
      const btnBaseMat = this._registerHudMaterial(new THREE.MeshBasicMaterial({ color: 0x020617 }), 0.9);
      const btnBase = new THREE.Mesh(new THREE.BoxGeometry(d.w, 0.11, 0.018), btnBaseMat);
      btnBase.position.set(d.x, -0.16, 0.01);
      btnBase.renderOrder = 903;
      this.vrGroup.add(btnBase);

      const btnFaceMat = this._registerHudMaterial(
        new THREE.MeshBasicMaterial({ map: createButtonTexture(d.label, d.color) }),
        1.0
      );
      const btnFace = new THREE.Mesh(new THREE.PlaneGeometry(d.w - 0.01, 0.105), btnFaceMat);
      btnFace.position.set(d.x, -0.16, 0.022);
      btnFace.renderOrder = 904;
      btnFace.userData = { vrSkill: d.skill };
      this.vrGroup.add(btnFace);
      this.vrButtons.push(btnFace);
    });

    this._eyeCanvas = document.createElement("canvas");
    this._eyeCanvas.width = 180; this._eyeCanvas.height = 96;
    drawEyeButtonCanvas(this._eyeCanvas, this._vrFullOpacity);
    this._eyeTex = new THREE.CanvasTexture(this._eyeCanvas);
    this._eyeTex.colorSpace = THREE.SRGBColorSpace;

    const eyeBaseMat = this._registerHudMaterial(new THREE.MeshBasicMaterial({ color: 0x020617 }), 0.9);
    const eyeBase = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.11, 0.018), eyeBaseMat);
    eyeBase.position.set(0.44, -0.16, 0.01);
    eyeBase.renderOrder = 903;
    this.vrGroup.add(eyeBase);

    const eyeFaceMat = this._registerHudMaterial(new THREE.MeshBasicMaterial({ map: this._eyeTex }), 1.0);
    this.vrEyeBtn = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.105), eyeFaceMat);
    this.vrEyeBtn.position.set(0.44, -0.16, 0.022);
    this.vrEyeBtn.renderOrder = 904;
    this.vrEyeBtn.userData = { vrToggleOpacity: true };
    this.vrGroup.add(this.vrEyeBtn);

    this.scene.add(this.vrGroup);
    this.updateVRHud(
      "Point laser & pull Trigger to drop a pin.",
      { hp: 16, maxHp: 16, stress: 0, maxStress: 10, wonlongs: 750 },
      "Click the Eye icon to toggle 25% / 100% HUD opacity."
    );
  }

  // --- Always-On-Top 3D VR Item Inspection Card ---
  _buildVRInspectCard() {
    this.vrInspectGroup = new THREE.Group();
    this.vrInspectGroup.position.set(0.86, 0.18, 0.12);
    this.vrInspectGroup.rotation.y = -0.28;
    this.vrInspectGroup.visible = false;

    // Exact-dimension drop shadow offset tightly right & down
    const cardShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.64, 0.80),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6, depthTest: false, depthWrite: false })
    );
    cardShadow.position.set(0.006, -0.006, -0.031);
    cardShadow.renderOrder = 910;
    this.vrInspectGroup.add(cardShadow);

    const cardBezel = new THREE.Mesh(
      new THREE.BoxGeometry(0.64, 0.80, 0.024),
      new THREE.MeshBasicMaterial({ color: 0x071022, depthTest: false, depthWrite: false })
    );
    cardBezel.position.set(0, 0, -0.018);
    cardBezel.renderOrder = 911;
    this.vrInspectGroup.add(cardBezel);

    this.vrInspectCanvas = document.createElement("canvas");
    this.vrInspectCanvas.width = 512; this.vrInspectCanvas.height = 640;
    this.vrInspectTex = new THREE.CanvasTexture(this.vrInspectCanvas);
    this.vrInspectTex.colorSpace = THREE.SRGBColorSpace;

    const cardFace = new THREE.Mesh(
      new THREE.PlaneGeometry(0.61, 0.77),
      new THREE.MeshBasicMaterial({ map: this.vrInspectTex, depthTest: false, depthWrite: false })
    );
    cardFace.position.set(0, 0, 0.004);
    cardFace.renderOrder = 912;
    this.vrInspectGroup.add(cardFace);

    const closeFace = new THREE.Mesh(
      new THREE.PlaneGeometry(0.16, 0.065),
      new THREE.MeshBasicMaterial({ map: createButtonTexture("CLOSE [X]", "#ff2a85"), depthTest: false, depthWrite: false })
    );
    closeFace.position.set(0.20, 0.34, 0.022);
    closeFace.renderOrder = 913;
    closeFace.userData = { vrCloseInspect: true };
    this.vrInspectGroup.add(closeFace);
    this.vrCloseBtn = closeFace;

    this.vrGroup.add(this.vrInspectGroup);
  }

  showVRInspectCard(entity) {
    if (!entity) return;
    const loadId = ++this._inspectLoadId;
    this.vrInspectGroup.visible = true;

    const renderCard = (img = null) => {
      const ctx = this.vrInspectCanvas.getContext("2d");
      ctx.fillStyle = "#080e1c";
      ctx.fillRect(0, 0, 512, 640);
      ctx.strokeStyle = "#00f0ff";
      ctx.lineWidth = 6;
      ctx.strokeRect(4, 4, 504, 632);

      const cat = String(entity.category || "ITEM").toUpperCase();
      ctx.fillStyle = "#00f0ff";
      ctx.fillRect(24, 24, 150, 32);
      ctx.fillStyle = "#050811";
      ctx.font = "bold 18px system-ui, sans-serif";
      ctx.fillText(cat.slice(0, 12), 34, 46);

      ctx.fillStyle = "#0f172a";
      ctx.fillRect(24, 72, 464, 260);
      ctx.strokeStyle = "#334155";
      ctx.lineWidth = 2;
      ctx.strokeRect(24, 72, 464, 260);

      if (img) {
        const scale = Math.min(452 / img.width, 248 / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, 24 + (464 - w) / 2, 72 + (260 - h) / 2, w, h);
      } else {
        ctx.fillStyle = "#ff2a85";
        ctx.font = "bold 64px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(String(entity.name || "?").slice(0, 2).toUpperCase(), 256, 224);
        ctx.textAlign = "left";
      }

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 30px system-ui, sans-serif";
      ctx.fillText(String(entity.name || "Unknown").slice(0, 26), 24, 372);

      const tags = Array.isArray(entity.tags_list) && entity.tags_list.length
        ? entity.tags_list.join(" • ")
        : String(entity.classification_tags || "");
      ctx.fillStyle = "#fbbf24";
      ctx.font = "bold 18px monospace";
      ctx.fillText(tags.slice(0, 40), 24, 404);

      const body =
        entity.lore_bio_stats ||
        entity.stats_lore ||
        entity.visual_description_for_image_gen ||
        entity.description ||
        "No tactical specs logged.";
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "20px system-ui, sans-serif";
      wrapCanvasText(ctx, body, 24, 444, 464, 28, 7);

      this.vrInspectTex.needsUpdate = true;
    };

    renderCard(null);

    const imgUrl = entity.image_2d || entity.image_action || "";
    if (imgUrl) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (loadId === this._inspectLoadId) renderCard(img);
      };
      img.src = imgUrl;
    }
  }

  hideVRInspectCard() {
    this.vrInspectGroup.visible = false;
  }

  startVRScan(skill, vitals) {
    clearInterval(this._vrScanInterval);
    const start = performance.now();
    const hexChars = "0123456789ABCDEF";
    const randHex = () => Array.from({ length: 4 }, () => hexChars[Math.floor(Math.random() * 16)]).join("");

    const drawScan = () => {
      const pct = Math.min(1, (performance.now() - start) / 700);
      const fakeDie = String(Math.floor(Math.random() * 20) + 1).padStart(2, "0");
      this.updateVRHud(
        `[${skill.toUpperCase()}] TELEMETRY SCAN // d20(${fakeDie}) // 0x${randHex()}`,
        vitals,
        "Decrypting neural check outcome...",
        pct,
        "#fbbf24"
      );
    };
    drawScan();
    this._vrScanInterval = setInterval(drawScan, 60);
  }

  updateVRHud(headline, vitals, subline = "", scanPct = null, borderColor = "#00f0ff") {
    if (scanPct === null) clearInterval(this._vrScanInterval);
    const ctx = this.vrCanvas.getContext("2d");
    ctx.fillStyle = "rgba(8, 14, 28, 0.96)";
    ctx.fillRect(0, 0, 768, 256);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 5;
    ctx.strokeRect(4, 4, 760, 248);

    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 22px monospace";
    ctx.fillText(
      `HP ${vitals.hp}/${vitals.maxHp}   STRESS ${vitals.stress}/${vitals.maxStress}   ₩${vitals.wonlongs}`,
      24, 40
    );

    ctx.fillStyle = borderColor === "#fbbf24" ? "#fbbf24" : "#ffffff";
    ctx.font = "bold 23px system-ui, sans-serif";
    ctx.fillText(String(headline || "").slice(0, 56), 24, 88);

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "20px system-ui, sans-serif";
    wrapCanvasText(ctx, subline, 24, 126, 720, 28, 3);

    if (scanPct !== null) {
      ctx.fillStyle = "rgba(56, 189, 248, 0.2)";
      ctx.fillRect(24, 212, 720, 10);
      ctx.fillStyle = "#fbbf24";
      ctx.fillRect(24, 212, Math.round(720 * scanPct), 10);
    } else {
      ctx.fillStyle = "#94a3b8";
      ctx.font = "16px monospace";
      ctx.fillText("Trigger: Drop Pin / Click   •   Grip + Drag (or Stick): Spin Room", 24, 236);
    }

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
      if (hits.length) this.dropPinAtWorldPoint(hits[0].point);
    });
  }

  _getControllerAzimuth(ctrl) {
    const xrCam = this.renderer.xr.getCamera();
    xrCam.getWorldPosition(this._tmpCamPos);
    ctrl.getWorldPosition(this._tmpCtrlPos);
    return Math.atan2(
      this._tmpCtrlPos.x - this._tmpCamPos.x,
      this._tmpCtrlPos.z - this._tmpCamPos.z
    );
  }

  _setRayFromController(ctrl) {
    this._tmpRayMatrix.identity().extractRotation(ctrl.matrixWorld);
    this.raycaster.ray.origin.setFromMatrixPosition(ctrl.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this._tmpRayMatrix);
  }

  _bindWebXREvents() {
    const handleSelect = (ctrl) => {
      this._setRayFromController(ctrl);

      if (this.vrInspectGroup.visible) {
        const closeHits = this.raycaster.intersectObject(this.vrCloseBtn, false);
        if (closeHits.length) {
          this.hideVRInspectCard();
          return;
        }
      }

      const eyeHits = this.raycaster.intersectObject(this.vrEyeBtn, false);
      if (eyeHits.length) {
        this.toggleVROpacity();
        return;
      }

      const btnHits = this.raycaster.intersectObjects(this.vrButtons, false);
      if (btnHits.length) {
        this.onVrAction(btnHits[0].object.userData.vrSkill);
        return;
      }

      const panelHits = this.raycaster.intersectObjects([this.vrScreenMesh, this.vrBackdropMesh], false);
      if (panelHits.length) return;

      const domeHits = this.raycaster.intersectObject(this.hitSphere, false);
      if (domeHits.length) this.dropPinAtWorldPoint(domeHits[0].point);
    };

    // Visible 3D laser beam cylinder (unit length along -Z, scaled dynamically to hit distance)
    const beamGeo = new THREE.CylinderGeometry(0.0028, 0.0028, 1, 8, 1, true);
    beamGeo.rotateX(-Math.PI / 2);
    beamGeo.translate(0, 0, -0.5);
    const dotGeo = new THREE.SphereGeometry(0.011, 12, 12);

    [0, 1].forEach((idx) => {
      const ctrl = this.renderer.xr.getController(idx);
      const rayMat = new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        transparent: true,
        opacity: 0.9,
        depthTest: false,
        depthWrite: false,
      });

      const rayBeam = new THREE.Mesh(beamGeo, rayMat);
      rayBeam.scale.set(1, 1, 12);
      rayBeam.renderOrder = 950;
      rayBeam.frustumCulled = false;
      ctrl.add(rayBeam);

      const rayDot = new THREE.Mesh(dotGeo, rayMat);
      rayDot.position.set(0, 0, -12);
      rayDot.renderOrder = 951;
      rayDot.frustumCulled = false;
      ctrl.add(rayDot);

      ctrl.userData.rayMat = rayMat;
      ctrl.userData.rayBeam = rayBeam;
      ctrl.userData.rayDot = rayDot;

      ctrl.addEventListener("select", () => handleSelect(ctrl));

      ctrl.addEventListener("squeezestart", () => {
        this.grabbingCtrl = ctrl;
        this.lastGrabAngle = this._getControllerAzimuth(ctrl);
        rayMat.color.setHex(0xfbbf24);
      });
      ctrl.addEventListener("squeezeend", () => {
        if (this.grabbingCtrl === ctrl) this.grabbingCtrl = null;
        rayMat.color.setHex(0x00f0ff);
      });

      this.scene.add(ctrl);
      this.controllers.push(ctrl);
    });
  }

  _updateVRHover() {
    const interactiveBtns = [...this.vrButtons, this.vrEyeBtn];
    if (this.vrInspectGroup.visible) interactiveBtns.push(this.vrCloseBtn);
    const panelTargets = [...interactiveBtns, this.vrScreenMesh, this.vrBackdropMesh];

    let anyHudHit = false;
    let hitBtn = null;

    for (const ctrl of this.controllers) {
      if (this.grabbingCtrl === ctrl) continue;
      this._setRayFromController(ctrl);
      const hits = this.raycaster.intersectObjects(panelTargets, false);

      if (hits.length) {
        anyHudHit = true;
        const dist = Math.max(0.1, hits[0].distance);
        ctrl.userData.rayBeam.scale.set(1, 1, dist);
        ctrl.userData.rayDot.position.set(0, 0, -dist);
        ctrl.userData.rayDot.visible = true;

        if (interactiveBtns.includes(hits[0].object)) {
          hitBtn = hits[0].object;
          ctrl.userData.rayMat.color.setHex(0x34d399);
        } else {
          ctrl.userData.rayMat.color.setHex(0xffffff);
        }
      } else {
        ctrl.userData.rayBeam.scale.set(1, 1, 12);
        ctrl.userData.rayDot.position.set(0, 0, -12);
        ctrl.userData.rayDot.visible = true;
        ctrl.userData.rayMat.color.setHex(0x00f0ff);
      }
    }

    for (const btn of interactiveBtns) {
      const targetScale = btn === hitBtn ? 1.07 : 1.0;
      btn.scale.set(targetScale, targetScale, 1);
    }
    this._vrHudHovered = anyHudHit;
    this._hoveredBtn = hitBtn;
  }

  _updateSeatedRoomSpin() {
    if (this.grabbingCtrl) {
      const currentAngle = this._getControllerAzimuth(this.grabbingCtrl);
      let delta = currentAngle - this.lastGrabAngle;
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      this.worldGroup.rotation.y += delta * 2.4;
      this.lastGrabAngle = currentAngle;
    }

    const session = this.renderer.xr.getSession();
    if (session) {
      for (const source of session.inputSources) {
        const gp = source.gamepad;
        if (!gp || !gp.axes || gp.axes.length < 3) continue;
        const stickX = gp.axes[2] || gp.axes[0] || 0;
        if (Math.abs(stickX) > 0.2) {
          this.worldGroup.rotation.y -= stickX * 0.035;
        }
      }
    }
  }

  _updateHeadLockedVRHud() {
    const xrCam = this.renderer.xr.getCamera();
    xrCam.getWorldPosition(this._tmpCamPos);
    xrCam.getWorldQuaternion(this._tmpCamQuat);

    this._tmpForward.set(0, 0, -1).applyQuaternion(this._tmpCamQuat);
    this._tmpForward.y = 0;
    if (this._tmpForward.lengthSq() < 0.0001) {
      this._tmpForward.set(0, 0, -1);
    } else {
      this._tmpForward.normalize();
    }

    const dist = this._vrHudHovered ? 1.15 : 1.28;
    const pitchRad = THREE.MathUtils.degToRad(-45);
    const horizDist = dist * Math.cos(pitchRad);
    const vertOffset = dist * Math.sin(pitchRad);

    this._tmpTargetPos.copy(this._tmpCamPos).addScaledVector(this._tmpForward, horizDist);
    this._tmpTargetPos.y += vertOffset;

    this._tmpLookMatrix.lookAt(this._tmpCamPos, this._tmpTargetPos, this._upVec);
    this._tmpTargetQuat.setFromRotationMatrix(this._tmpLookMatrix);

    if (!this._hudInitialized) {
      this.vrGroup.position.copy(this._tmpTargetPos);
      this.vrGroup.quaternion.copy(this._tmpTargetQuat);
      this._hudInitialized = true;
    } else {
      const followRate = this._vrHudHovered ? 0.025 : 0.09;
      this.vrGroup.position.lerp(this._tmpTargetPos, followRate);
      this.vrGroup.quaternion.slerp(this._tmpTargetQuat, followRate);
    }
  }

  update(timeSec) {
    const inVR = this.renderer.xr.isPresenting;
    this.vrGroup.visible = inVR;

    if (inVR) {
      this._updateVRHover();
      this._updateSeatedRoomSpin();
      this._updateHeadLockedVRHud();
    } else {
      this._hudInitialized = false;
      this.grabbingCtrl = null;
      this._vrHudHovered = false;
    }

    if (this.pinGroup) {
      const s = 1 + Math.sin(timeSec * 4) * 0.04;
      this.pinGroup.scale.set(s, s, 1);
    }
  }
}
