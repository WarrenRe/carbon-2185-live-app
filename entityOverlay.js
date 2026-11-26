// entityOverlay.js — Floating Cyberpunk Entity Card & Target Lookup Display
import { processCutoutImage } from "./chromaKey.js";

export class EntityOverlay {
  constructor(assetResolver, container = document.body) {
    this.resolver = assetResolver;
    this.container = container;
    this.activeEntity = null;
    this.showingAction = false;
    this._injectStyles();
    this._buildDom();
  }

  _injectStyles() {
    if (document.getElementById("c2185-entity-overlay-styles")) return;
    const style = document.createElement("style");
    style.id = "c2185-entity-overlay-styles";
    style.textContent = `
      .c2185-card {
        position: fixed; right: 20px; bottom: 20px; width: 340px; max-width: calc(100vw - 40px);
        background: linear-gradient(155deg, rgba(10, 16, 32, 0.94), rgba(18, 10, 36, 0.94));
        border: 1px solid #00f0ff; border-radius: 12px;
        box-shadow: 0 0 28px rgba(0, 240, 255, 0.25), inset 0 0 18px rgba(255, 0, 128, 0.12);
        color: #e2f1ff; font-family: system-ui, -apple-system, sans-serif;
        overflow: hidden; z-index: 30;
        transform: translateY(20px); opacity: 0; pointer-events: none;
        transition: transform 0.25s ease, opacity 0.25s ease;
      }
      .c2185-card.visible {
        transform: translateY(0); opacity: 1; pointer-events: auto;
      }
      .c2185-card-header {
        display: flex; justify-content: space-between; align-items: center;
        padding: 10px 14px; background: rgba(0, 240, 255, 0.1);
        border-bottom: 1px solid rgba(0, 240, 255, 0.3);
      }
      .c2185-badge {
        font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
        color: #050811; background: #00f0ff; padding: 2px 7px; border-radius: 4px;
      }
      .c2185-close {
        background: none; border: none; color: #94a3b8; font-size: 18px; cursor: pointer; line-height: 1;
      }
      .c2185-close:hover { color: #ff2a85; }
      .c2185-visual {
        position: relative; height: 220px; display: flex; align-items: center; justify-content: center;
        background: radial-gradient(circle at center, rgba(0, 240, 255, 0.16), rgba(5, 8, 17, 0.95));
        padding: 12px;
      }
      .c2185-visual img {
        max-width: 100%; max-height: 100%; object-fit: contain;
        filter: drop-shadow(0 6px 16px rgba(0, 0, 0, 0.85));
      }
      .c2185-placeholder {
        width: 96px; height: 96px; border-radius: 50%; border: 2px dashed #ff2a85;
        display: flex; align-items: center; justify-content: center;
        font-size: 28px; font-weight: 800; color: #ff2a85; letter-spacing: 0.05em;
      }
      .c2185-toggle-btn {
        position: absolute; bottom: 8px; right: 8px;
        background: rgba(15, 23, 42, 0.88); color: #00f0ff; border: 1px solid #00f0ff;
        border-radius: 5px; font-size: 11px; padding: 4px 8px; cursor: pointer;
      }
      .c2185-body { padding: 12px 14px 14px; }
      .c2185-title { margin: 0 0 6px; font-size: 17px; color: #ffffff; }
      .c2185-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
      .c2185-tag {
        font-size: 10px; padding: 2px 6px; border-radius: 4px;
        background: rgba(255, 42, 133, 0.16); border: 1px solid rgba(255, 42, 133, 0.45); color: #ff9ec7;
      }
      .c2185-lore {
        margin: 0; font-size: 12.5px; line-height: 1.45; color: #cbd5e1;
        max-height: 120px; overflow-y: auto;
      }
    `;
    document.head.appendChild(style);
  }

  _buildDom() {
    this.el = document.createElement("aside");
    this.el.className = "c2185-card";
    this.el.innerHTML = `
      <div class="c2185-card-header">
        <span class="c2185-badge" id="c2185-card-cat">ENTITY</span>
        <button class="c2185-close" title="Close">&times;</button>
      </div>
      <div class="c2185-visual" id="c2185-card-visual"></div>
      <div class="c2185-body">
        <h2 class="c2185-title" id="c2185-card-title"></h2>
        <div class="c2185-tags" id="c2185-card-tags"></div>
        <p class="c2185-lore" id="c2185-card-lore"></p>
      </div>
    `;
    this.el.querySelector(".c2185-close").onclick = () => this.hide();
    this.container.appendChild(this.el);
  }

  /**
   * Looks up any target by name (from text input, click, or voice command)
   * and displays its chroma-keyed cutout + stats card.
   */
  async showTarget(query, category = null, preferAction = false) {
    const entity =
      typeof query === "string"
        ? this.resolver.resolveAssets(query, category)
        : query;

    if (!entity) {
      throw new Error(`Target "${query}" not found in Carbon 2185 database.`);
    }

    this.activeEntity = entity;
    this.showingAction = preferAction && Boolean(entity.imageAction);

    this.el.querySelector("#c2185-card-cat").textContent = entity.category;
    this.el.querySelector("#c2185-card-title").textContent = entity.name;
    this.el.querySelector("#c2185-card-lore").textContent =
      entity.lore || "No database dossier available.";

    const tagsEl = this.el.querySelector("#c2185-card-tags");
    tagsEl.innerHTML = (entity.tags || [])
      .map((t) => `<span class="c2185-tag">${t}</span>`)
      .join("");

    await this._renderVisual();
    this.el.classList.add("visible");
    return entity;
  }

  async _renderVisual() {
    const visualEl = this.el.querySelector("#c2185-card-visual");
    const entity = this.activeEntity;
    const rawUrl = this.showingAction
      ? entity.imageAction
      : entity.image2D || entity.imageAction;

    const isPlaceholder = !rawUrl || entity.imageStatus === "PLACEHOLDER";
    if (isPlaceholder) {
      const initials = entity.name
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() || "")
        .join("");
      visualEl.innerHTML = `<div class="c2185-placeholder">${initials || "?"}</div>`;
      return;
    }

    visualEl.innerHTML = `<span style="font-size:12px;color:#94a3b8;">Processing cutout...</span>`;
    const cleanSrc = await processCutoutImage(rawUrl);

    visualEl.innerHTML = `<img src="${cleanSrc}" alt="${entity.name}" />`;

    if (entity.image2D && entity.imageAction) {
      const btn = document.createElement("button");
      btn.className = "c2185-toggle-btn";
      btn.textContent = this.showingAction ? "View Isolated" : "View Action Shot";
      btn.onclick = async () => {
        this.showingAction = !this.showingAction;
        await this._renderVisual();
      };
      visualEl.appendChild(btn);
    }
  }

  hide() {
    this.el.classList.remove("visible");
  }
}
