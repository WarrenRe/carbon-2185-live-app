// hotspotManager.js — Task 4.3: 360° Spatial Reticle Pins + Desktop & WebXR Raycaster
import * as THREE from "three";

function createReticleTexture(hexColor = "#00f0ff") {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, 128, 128);
  ctx.strokeStyle = hexColor;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(64, 64, 42, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(64, 64, 24, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = hexColor;
  ctx.beginPath();
  ctx.arc(64, 64, 7, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class HotspotManager {
  constructor(scene, camera, renderer, onSelect) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.onSelect = onSelect;

    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.sprites = [];

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.downPos = { x: 0, y: 0 };
    this.hovered = null;

    this._buildTooltip();
    this._bindDesktopEvents();
    this._bindWebXREvents();
  }

  _buildTooltip() {
    this.tooltip = document.createElement("div");
    Object.assign(this.tooltip.style, {
      position: "fixed",
      zIndex: "30",
      pointerEvents: "none",
      display: "none",
      padding: "6px 10px",
      borderRadius: "6px",
      background: "rgba(8, 14, 28, 0.92)",
      border: "1px solid #00f0ff",
      color: "#e2f1ff",
      fontSize: "12px",
      fontFamily: "system-ui, sans-serif",
      boxShadow: "0 0 12px rgba(0, 240, 255, 0.3)",
    });
    document.body.appendChild(this.tooltip);
  }

  setHotspots(hotspots = []) {
    while (this.group.children.length) {
      const child = this.group.children[0];
      child.material.map?.dispose();
      child.material.dispose();
      this.group.remove(child);
    }
    this.sprites = [];

    const radius = 40;
    hotspots.forEach((hs) => {
      const mat = new THREE.SpriteMaterial({
        map: createReticleTexture(hs.color || "#00f0ff"),
        transparent: true,
        depthTest: false,
      });
      const sprite = new THREE.Sprite(mat);

      const phi = THREE.MathUtils.degToRad(90 - (hs.pitch || 0));
      const theta = THREE.MathUtils.degToRad(hs.yaw || 0);
      sprite.position.set(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta)
      );
      sprite.scale.set(4.5, 4.5, 1);
      sprite.userData = hs;

      this.group.add(sprite);
      this.sprites.push(sprite);
    });
  }

  _bindDesktopEvents() {
    const dom = this.renderer.domElement;

    dom.addEventListener("pointerdown", (e) => {
      this.downPos = { x: e.clientX, y: e.clientY };
    });

    dom.addEventListener("pointermove", (e) => {
      if (this.renderer.xr.isPresenting) return;
      this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
      this.raycaster.setFromCamera(this.pointer, this.camera);

      const hits = this.raycaster.intersectObjects(this.sprites, false);
      if (hits.length) {
        const hs = hits[0].object.userData;
        this.hovered = hits[0].object;
        dom.style.cursor = "pointer";
        this.tooltip.style.display = "block";
        this.tooltip.style.left = `${e.clientX + 14}px`;
        this.tooltip.style.top = `${e.clientY - 12}px`;
        this.tooltip.innerHTML = `<strong style="color:#00f0ff">${hs.label}</strong><br/><span>${hs.skill} Check • DC ${hs.dc}</span>`;
      } else {
        this.hovered = null;
        dom.style.cursor = "grab";
        this.tooltip.style.display = "none";
      }
    });

    dom.addEventListener("pointerup", (e) => {
      if (this.renderer.xr.isPresenting) return;
      const dist = Math.hypot(e.clientX - this.downPos.x, e.clientY - this.downPos.y);
      if (dist > 6) return; // Ignore camera drags

      this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
      this.raycaster.setFromCamera(this.pointer, this.camera);

      const hits = this.raycaster.intersectObjects(this.sprites, false);
      if (hits.length) {
        this.onSelect(hits[0].object.userData);
      }
    });
  }

  _bindWebXREvents() {
    const tempMatrix = new THREE.Matrix4();
    const handleXRSelect = (controller) => {
      tempMatrix.identity().extractRotation(controller.matrixWorld);
      this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
      this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
      const hits = this.raycaster.intersectObjects(this.sprites, false);
      if (hits.length) {
        this.onSelect(hits[0].object.userData);
      }
    };

    [0, 1].forEach((idx) => {
      const ctrl = this.renderer.xr.getController(idx);
      ctrl.addEventListener("select", () => handleXRSelect(ctrl));
      this.scene.add(ctrl);
    });
  }

  update(timeSec) {
    this.sprites.forEach((sprite, i) => {
      const pulse = sprite === this.hovered ? 5.6 : 4.3 + Math.sin(timeSec * 3 + i) * 0.35;
      sprite.scale.set(pulse, pulse, 1);
    });
  }
}
