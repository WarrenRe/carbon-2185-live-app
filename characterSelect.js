// characterSelect.js — Task 4.1B: Location, 60-Character Roster & Difficulty (Level) Launch Screen
const DIFFICULTY_TIERS = [
  { label: "Street Rookie", level: 1, desc: "Fresh off the transit pod. High stakes, raw chrome." },
  { label: "Edge Runner", level: 5, desc: "Seasoned freelancer with proven street cred." },
  { label: "Veteran Operator", level: 10, desc: "Elite specialist running black-ops contracts." },
  { label: "Cyber Legend", level: 15, desc: "High-tier augmentations and megacorp bounties." },
  { label: "Apex Mythic", level: 20, desc: "Peak Carbon 2185 build-out. Maximum lethality." },
];

function getField(obj, keys, fallback = "") {
  for (const k of keys) {
    const val = obj?.[k];
    if (val !== undefined && val !== null && String(val).trim() !== "") {
      return val;
    }
  }
  return fallback;
}

function getInitials(name) {
  return String(name || "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
}

export class CharacterSelect {
  constructor(resolver, onLaunch) {
    this.resolver = resolver;
    this.onLaunch = onLaunch;

    this.locations = [];
    this.characters = [];
    this.selectedLocation = null;
    this.selectedCharacter = null;
    this.selectedLevel = 1;

    this.filterOrigin = "ALL";
    this.filterClass = "ALL";
    this.searchQuery = "";

    this._injectStyles();
    this._buildDom();
  }

  _injectStyles() {
    if (document.getElementById("c2185-charselect-styles")) return;
    const style = document.createElement("style");
    style.id = "c2185-charselect-styles";
    style.textContent = `
      .c2185-launch-overlay {
        position: fixed; inset: 0; z-index: 50;
        background: radial-gradient(circle at top left, rgba(23, 16, 51, 0.97), rgba(5, 8, 17, 0.98) 70%);
        color: #e2f1ff; font-family: system-ui, -apple-system, sans-serif;
        display: flex; flex-direction: column; overflow: hidden;
        transition: opacity 0.35s ease;
      }
      .c2185-launch-overlay.hidden { opacity: 0; pointer-events: none; }
      .c2185-launch-header {
        display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;
        padding: 16px 24px; border-bottom: 1px solid rgba(0, 240, 255, 0.3);
        background: rgba(8, 14, 28, 0.85);
      }
      .c2185-launch-header h1 {
        margin: 0; font-size: 18px; color: #00f0ff; letter-spacing: 0.1em; text-transform: uppercase;
      }
      .c2185-launch-sub { font-size: 12px; color: #94a3b8; }
      .c2185-launch-main {
        flex: 1; display: grid; grid-template-columns: 290px 1fr 330px; gap: 16px;
        padding: 16px 24px; overflow: hidden;
      }
      @media (max-width: 1024px) {
        .c2185-launch-main { grid-template-columns: 1fr; overflow-y: auto; }
      }
      .c2185-col {
        background: rgba(8, 14, 28, 0.86); border: 1px solid rgba(0, 240, 255, 0.25);
        border-radius: 12px; padding: 14px; display: flex; flex-direction: column; overflow: hidden;
      }
      .c2185-col h2 {
        margin: 0 0 10px; font-size: 12px; color: #00f0ff; text-transform: uppercase;
        letter-spacing: 0.08em; border-bottom: 1px solid rgba(0, 240, 255, 0.2); padding-bottom: 6px;
      }
      .c2185-scroll { flex: 1; overflow-y: auto; padding-right: 4px; }
      .c2185-loc-btn {
        width: 100%; text-align: left; background: #0f172a; color: #e2f1ff;
        border: 1px solid #334155; border-radius: 8px; padding: 9px 10px;
        margin-bottom: 8px; cursor: pointer; font-size: 12.5px;
      }
      .c2185-loc-btn:hover { border-color: #38bdf8; }
      .c2185-loc-btn.active { border-color: #00f0ff; background: rgba(0, 240, 255, 0.14); }
      .c2185-pill {
        display: inline-block; font-size: 9.5px; font-weight: 700; padding: 2px 6px;
        border-radius: 4px; margin-left: 6px; text-transform: uppercase;
      }
      .c2185-pill.ready { background: #00f0ff; color: #050811; }
      .c2185-pill.fallback { background: #334155; color: #cbd5e1; }
      .c2185-filters { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
      .c2185-filters select, .c2185-filters input {
        background: #0f172a; color: #fff; border: 1px solid #38bdf8;
        border-radius: 6px; padding: 6px 8px; font-size: 12px;
      }
      .c2185-filters input { flex: 1; min-width: 120px; }
      .c2185-char-grid {
        display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px;
      }
      .c2185-char-card {
        background: #0f172a; border: 1px solid #334155; border-radius: 10px;
        padding: 10px; cursor: pointer; display: flex; flex-direction: column; gap: 6px;
        transition: border-color 0.15s ease, transform 0.15s ease;
      }
      .c2185-char-card:hover { border-color: #ff2a85; transform: translateY(-2px); }
      .c2185-char-card.active {
        border-color: #00f0ff; box-shadow: 0 0 14px rgba(0, 240, 255, 0.25);
        background: rgba(0, 240, 255, 0.1);
      }
      .c2185-avatar {
        height: 92px; border-radius: 6px; background: radial-gradient(circle, #1e1b4b, #050811);
        display: flex; align-items: center; justify-content: center; overflow: hidden;
        font-size: 24px; font-weight: 800; color: #ff2a85; letter-spacing: 0.06em;
      }
      .c2185-avatar img { width: 100%; height: 100%; object-fit: cover; }
      .c2185-char-name { font-size: 13px; font-weight: 700; color: #fff; }
      .c2185-char-meta { font-size: 11px; color: #94a3b8; }
      .c2185-tier-btn {
        width: 100%; text-align: left; background: #0f172a; color: #e2f1ff;
        border: 1px solid #334155; border-radius: 7px; padding: 7px 10px;
        margin-bottom: 6px; cursor: pointer; font-size: 12px;
      }
      .c2185-tier-btn.active { border-color: #ff2a85; background: rgba(255, 42, 133, 0.16); }
      .c2185-level-row {
        display: flex; align-items: center; gap: 10px; margin: 8px 0 12px; font-size: 12px;
      }
      .c2185-level-row input { flex: 1; accent-color: #00f0ff; }
      .c2185-dossier {
        background: #050811; border: 1px solid #1e293b; border-radius: 8px;
        padding: 10px; font-size: 12px; line-height: 1.45; color: #cbd5e1;
      }
      .c2185-dossier h3 { margin: 0 0 4px; font-size: 15px; color: #fff; }
      .c2185-dossier .kv { margin: 4px 0; }
      .c2185-dossier .kv strong { color: #38bdf8; }
      .c2185-launch-btn {
        margin-top: 12px; width: 100%; padding: 12px; border: none; border-radius: 8px;
        background: linear-gradient(90deg, #00f0ff, #38bdf8); color: #050811;
        font-size: 14px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;
        cursor: pointer; box-shadow: 0 0 20px rgba(0, 240, 255, 0.35);
      }
      .c2185-launch-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    `;
    document.head.appendChild(style);
  }

  _buildDom() {
    this.el = document.createElement("div");
    this.el.className = "c2185-launch-overlay";
    this.el.innerHTML = `
      <header class="c2185-launch-header">
        <div>
          <h1>Carbon 2185 // Neural Link Setup</h1>
          <div class="c2185-launch-sub" id="cs-status">Loading Carbon 2185 database...</div>
        </div>
      </header>
      <main class="c2185-launch-main">
        <section class="c2185-col">
          <h2>1. Starting Location</h2>
          <div class="c2185-scroll" id="cs-locations"></div>
        </section>

        <section class="c2185-col">
          <h2>2. Select Operative (60 Premade Roster)</h2>
          <div class="c2185-filters">
            <select id="cs-origin-filter"><option value="ALL">All Origins</option></select>
            <select id="cs-class-filter"><option value="ALL">All Classes</option></select>
            <input id="cs-search" type="text" placeholder="Search name..." />
          </div>
          <div class="c2185-scroll">
            <div class="c2185-char-grid" id="cs-char-grid"></div>
          </div>
        </section>

        <section class="c2185-col">
          <h2>3. Difficulty (Level) & Dossier</h2>
          <div class="c2185-scroll">
            <div id="cs-tiers"></div>
            <div class="c2185-level-row">
              <span>Custom Level:</span>
              <input id="cs-level-slider" type="range" min="1" max="20" value="1" />
              <strong id="cs-level-val" style="color:#00f0ff;min-width:40px;">Lv. 1</strong>
            </div>
            <div class="c2185-dossier" id="cs-dossier">
              <em>Select a character to inspect their dossier.</em>
            </div>
          </div>
          <button class="c2185-launch-btn" id="cs-launch-btn" disabled>Launch 360° Session</button>
        </section>
      </main>
    `;
    document.body.appendChild(this.el);

    this.el.querySelector("#cs-origin-filter").onchange = (e) => {
      this.filterOrigin = e.target.value;
      this._renderCharacters();
    };
    this.el.querySelector("#cs-class-filter").onchange = (e) => {
      this.filterClass = e.target.value;
      this._renderCharacters();
    };
    this.el.querySelector("#cs-search").oninput = (e) => {
      this.searchQuery = e.target.value.toLowerCase().trim();
      this._renderCharacters();
    };
    this.el.querySelector("#cs-level-slider").oninput = (e) => {
      this._setLevel(parseInt(e.target.value, 10));
    };
    this.el.querySelector("#cs-launch-btn").onclick = () => {
      if (!this.selectedLocation || !this.selectedCharacter) return;
      this.hide();
      this.onLaunch({
        location: this.selectedLocation,
        character: this.selectedCharacter,
        level: this.selectedLevel,
      });
    };
  }

  async init() {
    await this.resolver.init(true);

    // Sort locations so ones with a 360 skybox ready appear first
    const rawLocs = this.resolver.getCollection("Locations");
    this.locations = [...rawLocs].sort((a, b) => {
      const aReady = a.image_360 ? 1 : 0;
      const bReady = b.image_360 ? 1 : 0;
      return bReady - aReady || a.name.localeCompare(b.name);
    });

    this.characters = this.resolver.getCollection("Premade_Characters");

    this.selectedLocation = this.locations[0] || null;
    this.selectedCharacter = this.characters[0] || null;

    this._populateFilters();
    this._renderLocations();
    this._renderCharacters();
    this._renderTiers();
    this._renderDossier();

    const ready360 = this.locations.filter((l) => Boolean(l.image_360)).length;
    this.el.querySelector("#cs-status").textContent =
      `Ready — ${this.locations.length} Locations (${ready360} with 360° scenes) • ${this.characters.length} Playable Characters`;
    this._updateLaunchState();
  }

  _populateFilters() {
    const origins = new Set();
    const classes = new Set();
    this.characters.forEach((c) => {
      const o = getField(c, ["origin_race", "origin", "race"]);
      const cl = getField(c, ["class", "character_class"]);
      if (o) origins.add(o);
      if (cl) classes.add(cl);
    });

    const originSel = this.el.querySelector("#cs-origin-filter");
    [...origins].sort().forEach((o) => {
      const opt = document.createElement("option");
      opt.value = o;
      opt.textContent = o;
      originSel.appendChild(opt);
    });

    const classSel = this.el.querySelector("#cs-class-filter");
    [...classes].sort().forEach((cl) => {
      const opt = document.createElement("option");
      opt.value = cl;
      opt.textContent = cl;
      classSel.appendChild(opt);
    });
  }

  _renderLocations() {
    const container = this.el.querySelector("#cs-locations");
    container.innerHTML = "";
    this.locations.forEach((loc) => {
      const btn = document.createElement("button");
      btn.className = `c2185-loc-btn ${this.selectedLocation?.id === loc.id ? "active" : ""}`;
      const badge = loc.image_360
        ? `<span class="c2185-pill ready">360° Ready</span>`
        : `<span class="c2185-pill fallback">2D / Grid</span>`;
      btn.innerHTML = `<strong>${loc.name}</strong>${badge}`;
      btn.onclick = () => {
        this.selectedLocation = loc;
        this._renderLocations();
        this._updateLaunchState();
      };
      container.appendChild(btn);
    });
  }

  _renderCharacters() {
    const grid = this.el.querySelector("#cs-char-grid");
    grid.innerHTML = "";

    const filtered = this.characters.filter((c) => {
      const origin = getField(c, ["origin_race", "origin", "race"]);
      const cls = getField(c, ["class", "character_class"]);
      if (this.filterOrigin !== "ALL" && origin !== this.filterOrigin) return false;
      if (this.filterClass !== "ALL" && cls !== this.filterClass) return false;
      if (this.searchQuery && !c.name.toLowerCase().includes(this.searchQuery)) return false;
      return true;
    });

    if (!filtered.length) {
      grid.innerHTML = `<div style="color:#94a3b8;font-size:12px;">No characters match your filter.</div>`;
      return;
    }

    filtered.forEach((char) => {
      const origin = getField(char, ["origin_race", "origin", "race"], "Unknown");
      const cls = getField(char, ["class", "character_class"], "Operative");
      const card = document.createElement("div");
      card.className = `c2185-char-card ${this.selectedCharacter?.id === char.id ? "active" : ""}`;

      const hasPortrait = char.image_2d && char.image_status !== "PLACEHOLDER";
      const avatarHtml = hasPortrait
        ? `<img src="${char.image_2d}" alt="${char.name}" onerror="this.parentElement.textContent='${getInitials(char.name)}'" />`
        : getInitials(char.name);

      card.innerHTML = `
        <div class="c2185-avatar">${avatarHtml}</div>
        <div class="c2185-char-name">${char.name}</div>
        <div class="c2185-char-meta">${origin} • ${cls}</div>
      `;
      card.onclick = () => {
        this.selectedCharacter = char;
        this._renderCharacters();
        this._renderDossier();
        this._updateLaunchState();
      };
      grid.appendChild(card);
    });
  }

  _renderTiers() {
    const container = this.el.querySelector("#cs-tiers");
    container.innerHTML = "";
    DIFFICULTY_TIERS.forEach((tier) => {
      const btn = document.createElement("button");
      btn.className = `c2185-tier-btn ${this.selectedLevel === tier.level ? "active" : ""}`;
      btn.innerHTML = `<strong>${tier.label} (Lv. ${tier.level})</strong><div style="font-size:11px;color:#94a3b8;">${tier.desc}</div>`;
      btn.onclick = () => this._setLevel(tier.level);
      container.appendChild(btn);
    });
  }

  _setLevel(lvl) {
    this.selectedLevel = Math.max(1, Math.min(20, lvl));
    this.el.querySelector("#cs-level-slider").value = this.selectedLevel;
    this.el.querySelector("#cs-level-val").textContent = `Lv. ${this.selectedLevel}`;
    this._renderTiers();
    this._renderDossier();
  }

  _renderDossier() {
    const box = this.el.querySelector("#cs-dossier");
    const c = this.selectedCharacter;
    if (!c) {
      box.innerHTML = `<em>Select a character to inspect their dossier.</em>`;
      return;
    }

    const origin = getField(c, ["origin_race", "origin", "race"], "Unknown");
    const cls = getField(c, ["class", "character_class"], "Operative");
    const backstory = getField(c, ["backstory", "lore_bio_stats", "bio", "lore"], "No dossier text.");
    const weapons = getField(c, ["starter_weapons", "weapons", "starting_equipment"], "Standard Sidearm");
    const skills = getField(c, ["skills", "skill_proficiencies"], "Streetwise, Perception");
    const stats = getField(c, ["stats", "ability_scores", "core_stats"], "");
    const levelBuild = getField(c, [`level_${this.selectedLevel}`, `lv_${this.selectedLevel}`], "");

    const formatVal = (v) => (typeof v === "object" ? JSON.stringify(v) : String(v));

    box.innerHTML = `
      <h3>${c.name}</h3>
      <div class="kv"><strong>Origin / Class:</strong> ${origin} • ${cls} (Lv. ${this.selectedLevel})</div>
      ${stats ? `<div class="kv"><strong>Stats:</strong> ${formatVal(stats)}</div>` : ""}
      <div class="kv"><strong>Starter Weapons:</strong> ${formatVal(weapons)}</div>
      <div class="kv"><strong>Skills:</strong> ${formatVal(skills)}</div>
      ${levelBuild ? `<div class="kv"><strong>Lv. ${this.selectedLevel} Build:</strong>${formatVal(levelBuild)}</div>` : ""}
      <div class="kv" style="margin-top:8px;">${formatVal(backstory)}</div>
    `;
  }

  _updateLaunchState() {
    this.el.querySelector("#cs-launch-btn").disabled = !(
      this.selectedLocation && this.selectedCharacter
    );
  }

  show() {
    this.el.classList.remove("hidden");
  }

  hide() {
    this.el.classList.add("hidden");
  }
}
