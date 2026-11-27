// hotspotManager.js — 360° Pin-Drop Rings, Seated Grab-to-Spin, Head-Following 3D VR HUD & VR Item Showcase
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

    // Invisible 360° sphere inside worldGroup so pins stay aligned when spinning the room
    const hitGeo = new THREE.SphereGeometry(PIN_RADIUS, 32, 24);
    hitGeo.scale(-1, 1, 1);
    this.hitSphere = new THREE.Mesh(hitGeo, new THREE.MeshBasicMaterial({ visible: false }));
    this.worldGroup.add(this.hitSphere);

    this.markersGroup = new THREE.Group();
    this.worldGroup.add(this.markersGroup);
    this.pinGroup = null;
    this.activePinDir = null;

    // VR grab-to-spin state
    this.controllers = [];
    this.grabbingCtrl = null;
    this.lastGrabAngle = 0;

    // VR scan animation & inspect card state
    this._vrScanInterval = null;
    this._inspectLoadId = 0;
    this._hudInitialized = false;
    this._tmpCamPos = new THREE.Vector3();
    this._tmpCamQuat = new THREE.Quaternion();
    this._tmpForward = new THREE.Vector3();
    this._tmpTargetPos = new THREE.Vector3();
    this._tmpLookMatrix = new THREE.Matrix4();
    this._tmpTargetQuat = new THREE.Quaternion();
    this._tmpCtrlPos = new THREE.Vector3();

    this._buildVRHud();
    this._buildVRInspectCard();
    this._bindDesktopEvents();
    this._bindWebXREvents();
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
    // Convert hit point into worldGroup local space so spun rooms stay 100% accurate
    const localPoint = this.worldGroup.worldToLocal(worldPoint.clone());
    const unit = localPoint.normalize();
    this.activePinDir = { x: unit.x, y: unit.y, z: unit.z };

    if (this.pinGroup) this.worldGroup.remove(this.pinGroup);
    this.pinGroup = new THREE.Group();
    this.pinGroup.position.copy(unit).multiplyScalar(PIN_RADIUS - 0.5);
    this.pinGroup.lookAt(0, 0, 0);

    const outerGeo = new THREE.RingGeometry(OUTER_RING_WORLD - 0.25, OUTER_RING_WORLD, 48);
    const outerMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
    this.pinGroup.add(new THREE.Mesh(outerGeo, outerMat));

    const innerGeo = new THREE.RingGeometry(INNER_RING_WORLD - 0.22, INNER_RING_WORLD, 36);
    const innerMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    this.pinGroup.add(new THREE.Mesh(innerGeo, innerMat));

    const dotGeo = new THREE.CircleGeometry(0.65, 20);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, side: THREE.DoubleSide });
    this.pinGroup.add(new THREE.Mesh(dotGeo, dotMat));

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

  // --- Elevated, Depth-Layered, Head-Following 3D VR Visor HUD ---
  _buildVRHud() {
    this.vrGroup = new THREE.Group();
    this.vrGroup.visible = false;

    // Soft drop-shadow behind panel for depth
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(1.26, 0.58),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55 })
    );
    shadowPlane.position.set(0.02, -0.02, -0.05);
    this.vrGroup.add(shadowPlane);

    // 3D physical bezel backing
    const bezel = new THREE.Mesh(
      new THREE.BoxGeometry(1.20, 0.52, 0.024),
      new THREE.MeshBasicMaterial({ color: 0x071022 })
    );
    bezel.position.set(0, 0.02, -0.02);
    this.vrGroup.add(bezel);

    // Main telemetry readout canvas
    this.vrCanvas = document.createElement("canvas");
    this.vrCanvas.width = 768; this.vrCanvas.height = 256;
    this.vrTex = new THREE.CanvasTexture(this.vrCanvas);
    this.vrTex.colorSpace = THREE.SRGBColorSpace;

    const screenMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.14, 0.36),
      new THREE.MeshBasicMaterial({ map: this.vrTex, transparent: true })
    );
    screenMesh.position.set(0, 0.09, 0.002);
    this.vrGroup.add(screenMesh);

    // Raised 3D action buttons with drop shadows
    this.vrButtons = [];
    const defs = [
      { label: "INVESTIGATE", skill: "Investigation", x: -0.37, color: "#00f0ff" },
      { label: "HACK", skill: "Hack", x: 0, color: "#fbbf24" },
      { label: "ATTACK", skill: "Attack", x: 0.37, color: "#ff2a85" },
    ];
    defs.forEach((d) => {
      const btnBase = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.11, 0.022),
        new THREE.MeshBasicMaterial({ color: 0x020617 })
      );
      btnBase.position.set(d.x, -0.16, 0.008);
      this.vrGroup.add(btnBase);

      const btnFace = new THREE.Mesh(
        new THREE.PlaneGeometry(0.31, 0.105),
        new THREE.MeshBasicMaterial({ map: createButtonTexture(d.label, d.color) })
      );
      btnFace.position.set(d.x, -0.16, 0.021);
      btnFace.userData = { vrSkill: d.skill };
      this.vrGroup.add(btnFace);
      this.vrButtons.push(btnFace);
    });

    this.scene.add(this.vrGroup);
    this.updateVRHud(
      "Point laser & pull Trigger to drop a pin.",
      { hp: 16, maxHp: 16, stress: 0, maxStress: 10, wonlongs: 750 },
      "Hold Grip + sweep hand (or push thumbstick) to spin the room."
    );
  }

  // --- 3D VR Item Inspection Card (Docked to the right of the VR HUD) ---
  _buildVRInspectCard() {
    this.vrInspectGroup = new THREE.Group();
    this.vrInspectGroup.position.set(0.88, 0.06, 0.10);
    this.vrInspectGroup.rotation.y = -0.28;
    this.vrInspectGroup.visible = false;

    const cardShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.68, 0.84),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55 })
    );
    cardShadow.position.set(0.02, -0.02, -0.045);
    this.vrInspectGroup.add(cardShadow);

    const cardBezel = new THREE.Mesh(
      new THREE.BoxGeometry(0.64, 0.80, 0.024),
      new THREE.MeshBasicMaterial({ color: 0x071022 })
    );
    cardBezel.position.set(0, 0, -0.018);
    this.vrInspectGroup.add(cardBezel);

    this.vrInspectCanvas = document.createElement("canvas");
    this.vrInspectCanvas.width = 512; this.vrInspectCanvas.height = 640;
    this.vrInspectTex = new THREE.CanvasTexture(this.vrInspectCanvas);
    this.vrInspectTex.colorSpace = THREE.SRGBColorSpace;

    const cardFace = new THREE.Mesh(
      new THREE.PlaneGeometry(0.61, 0.77),
      new THREE.MeshBasicMaterial({ map: this.vrInspectTex })
    );
    cardFace.position.set(0, 0, 0.002);
    this.vrInspectGroup.add(cardFace);

    // Clickable 3D Close [X] button
    const closeFace = new THREE.Mesh(
      new THREE.PlaneGeometry(0.16, 0.065),
      new THREE.MeshBasicMaterial({ map: createButtonTexture("CLOSE [X]", "#ff2a85") })
    );
    closeFace.position.set(0.20, 0.34, 0.022);
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

      // Category badge
      const cat = String(entity.category || "ITEM").toUpperCase();
      ctx.fillStyle = "#00f0ff";
      ctx.fillRect(24, 24, 150, 32);
      ctx.fillStyle = "#050811";
      ctx.font = "bold 18px system-ui, sans-serif";
      ctx.fillText(cat.slice(0, 12), 34, 46);

      // Artwork frame
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

      // Item Name
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 30px system-ui, sans-serif";
      ctx.fillText(String(entity.name || "Unknown").slice(0, 26), 24, 372);

      // Tags
      const tags = Array.isArray(entity.tags_list) && entity.tags_list.length
        ? entity.tags_list.join(" • ")
        : String(entity.classification_tags || "");
      ctx.fillStyle = "#fbbf24";
      ctx.font = "bold 18px monospace";
      ctx.fillText(tags.slice(0, 40), 24, 404);

      // Lore / Stats
      const body =
        entity.lore_bio_stats ||
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

  // Animated 700ms telemetry scan directly on the raised VR HUD screen
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
      ctx.fillStyle = "#64748b";
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

  _bindWebXREvents() {
    const tempMatrix = new THREE.Matrix4();

    const handleSelect = (ctrl) => {
      tempMatrix.identity().extractRotation(ctrl.matrixWorld);
      this.raycaster.ray.origin.setFromMatrixPosition(ctrl.matrixWorld);
      this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

      // 1. Check VR Item Inspect Close [X] button
      if (this.vrInspectGroup.visible) {
        const closeHits = this.raycaster.intersectObject(this.vrCloseBtn, false);
        if (closeHits.length) {
          this.hideVRInspectCard();
          return;
        }
      }

      // 2. Check 3D VR Visor HUD buttons
      const btnHits = this.raycaster.intersectObjects(this.vrButtons, false);
      if (btnHits.length) {
        this.onVrAction(btnHits[0].object.userData.vrSkill);
        return;
      }

      // 3. Otherwise drop pin on the 360° dome
      const domeHits = this.raycaster.intersectObject(this.hitSphere, false);
      if (domeHits.length) this.dropPinAtWorldPoint(domeHits[0].point);
    };

    const rayGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -12),
    ]);

    [0, 1].forEach((idx) => {
      const ctrl = this.renderer.xr.getController(idx);
      const rayMat = new THREE.LineBasicMaterial({ color: 0x00f0ff });
      const rayLine = new THREE.Line(rayGeo, rayMat);
      ctrl.add(rayLine);
      ctrl.userData.rayMat = rayMat;

      ctrl.addEventListener("select", () => handleSelect(ctrl));

      // Grip (squeeze) grabs and spins the 360° room for seated play
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

  _updateSeatedRoomSpin() {
    // 1. Primary: Grip + drag hand left/right to spin the 360° room
    if (this.grabbingCtrl) {
      const currentAngle = this._getControllerAzimuth(this.grabbingCtrl);
      let delta = currentAngle - this.lastGrabAngle;
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      this.worldGroup.rotation.y += delta * 2.4;
      this.lastGrabAngle = currentAngle;
    }

    // 2. Secondary bonus: Quest thumbstick left/right smooth spin
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

    // Project forward along viewer's sightline, elevated comfortably just below eye level
    this._tmpForward.set(0, 0, -1).applyQuaternion(this._tmpCamQuat).normalize();
    this._tmpTargetPos.copy(this._tmpCamPos).addScaledVector(this._tmpForward, 1.55);
    this._tmpTargetPos.y -= 0.18;

    this._tmpLookMatrix.lookAt(this._tmpTargetPos, this._tmpCamPos, new THREE.Vector3(0, 1, 0));
    this._tmpTargetQuat.setFromRotationMatrix(this._tmpLookMatrix);

    if (!this._hudInitialized) {
      this.vrGroup.position.copy(this._tmpTargetPos);
      this.vrGroup.quaternion.copy(this._tmpTargetQuat);
      this._hudInitialized = true;
    } else {
      this.vrGroup.position.lerp(this._tmpTargetPos, 0.14);
      this.vrGroup.quaternion.slerp(this._tmpTargetQuat, 0.14);
    }
  }

  update(timeSec) {
    const inVR = this.renderer.xr.isPresenting;
    this.vrGroup.visible = inVR;

    if (inVR) {
      this._updateSeatedRoomSpin();
      this._updateHeadLockedVRHud();
    } else {
      this._hudInitialized = false;
      this.grabbingCtrl = null;
    }

    if (this.pinGroup) {
      const s = 1 + Math.sin(timeSec * 4) * 0.04;
      this.pinGroup.scale.set(s, s, 1);
    }
  }
}
