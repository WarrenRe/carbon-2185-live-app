// sceneManager.js — Carbon 2185 360° Equirectangular Skybox & Cross-Fade Manager
import * as THREE from "https://esm.sh/three@0.170.0";

export class SceneManager {
  constructor(scene, assetResolver, options = {}) {
    this.scene = scene;
    this.resolver = assetResolver;
    this.fadeDuration = options.fadeDuration ?? 0.5; // 0.5s cross-fade default
    this.currentLocation = null;
    this.isTransitioning = false;
    this.textureCache = new Map();

    this.loader = new THREE.TextureLoader();
    this.loader.setCrossOrigin("anonymous");

    // Primary skybox sphere (inward-facing via negative X scale)
    const primaryGeo = new THREE.SphereGeometry(500, 60, 40);
    primaryGeo.scale(-1, 1, 1);
    this.primaryMat = new THREE.MeshBasicMaterial({
      color: 0x050811,
      transparent: true,
      opacity: 1,
      depthWrite: false,
    });
    this.primaryDome = new THREE.Mesh(primaryGeo, this.primaryMat);
    this.primaryDome.renderOrder = -2;
    this.scene.add(this.primaryDome);

    // Slightly smaller inner sphere used to fade the incoming texture over the old one
    const fadeGeo = new THREE.SphereGeometry(498, 60, 40);
    fadeGeo.scale(-1, 1, 1);
    this.fadeMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.fadeDome = new THREE.Mesh(fadeGeo, this.fadeMat);
    this.fadeDome.visible = false;
    this.fadeDome.renderOrder = -1;
    this.scene.add(this.fadeDome);
  }

  loadTexture(url) {
    if (this.textureCache.has(url)) {
      return Promise.resolve(this.textureCache.get(url));
    }

    return new Promise((resolve, reject) => {
      this.loader.load(
        url,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.minFilter = THREE.LinearFilter;
          texture.magFilter = THREE.LinearFilter;
          this.textureCache.set(url, texture);
          resolve(texture);
        },
        undefined,
        (err) => reject(new Error(`Failed to load 360 texture: ${url} (${err?.message || "network error"})`))
      );
    });
  }

  /**
   * Switches active location state and cross-fades the 360° skybox over 0.5s.
   * Accepts a Location name, slug, or full entity object from AssetResolver.
   */
  async setLocation(locationQuery, onStateChange = null) {
    const resolved =
      typeof locationQuery === "string"
        ? this.resolver.resolveAssets(locationQuery, "Locations")
        : locationQuery;

    if (!resolved) {
      throw new Error(`Location not found in database: "${locationQuery}"`);
    }

    const skyboxUrl = resolved.image360 || resolved.image2D;
    if (!skyboxUrl) {
      throw new Error(`No 360 Scene URL or 2D Image URL logged for "${resolved.name}"`);
    }

    // Skip reload if already viewing this location
    if (this.currentLocation?.id === resolved.id && this.primaryMat.map) {
      return resolved;
    }

    const nextTexture = await this.loadTexture(skyboxUrl);

    // First scene load: apply immediately without waiting on a fade from black
    if (!this.primaryMat.map) {
      this.primaryMat.color.setHex(0xffffff);
      this.primaryMat.map = nextTexture;
      this.primaryMat.needsUpdate = true;
      this.currentLocation = resolved;
      if (typeof onStateChange === "function") onStateChange(resolved);
      return resolved;
    }

    // Cross-fade incoming texture on inner fadeDome, then swap onto primaryDome
    this.fadeMat.map = nextTexture;
    this.fadeMat.opacity = 0;
    this.fadeMat.needsUpdate = true;
    this.fadeDome.visible = true;
    this.isTransitioning = true;

    await this._animateFade(this.fadeDuration * 1000);

    this.primaryMat.map = nextTexture;
    this.primaryMat.needsUpdate = true;
    this.fadeDome.visible = false;
    this.fadeMat.opacity = 0;
    this.fadeMat.map = null;
    this.isTransitioning = false;

    this.currentLocation = resolved;
    if (typeof onStateChange === "function") onStateChange(resolved);
    return resolved;
  }

  _animateFade(durationMs) {
    return new Promise((resolve) => {
      const start = performance.now();
      const step = (now) => {
        const t = Math.min((now - start) / durationMs, 1);
        // Smooth cubic ease-in-out for comfortable headset transitions
        this.fadeMat.opacity = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
  }
}
