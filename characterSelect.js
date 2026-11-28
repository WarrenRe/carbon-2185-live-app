// characterSelect.js — Spotlight Character Carousel (with Filter Grid Toggle) & Sample Flavor Audio on Advance
const DIFFICULTY_TIERS = [
  { label: "Street Rookie", level: 1, desc: "Fresh off the transit pod. High stakes, raw chrome." },
  { label: "Edge Runner", level: 5, desc: "Seasoned freelancer with proven street cred." },
  { label: "Veteran Operator", level: 10, desc: "Elite specialist running black-ops contracts." },
  { label: "Cyber Legend", level: 15, desc: "High-tier augmentations and megacorp bounties." },
  { label: "Apex Mythic", level: 20, desc: "Peak Carbon 2185 build-out. Maximum lethality." },
];

const FALLBACK_FLAVOR_BY_CLASS = {
  Daimyo: "Follow my lead, or stay out of my fireline.",
  Doc: "I fix chrome and flesh—if you can pay.",
  Enforcer: "Point me at the problem. I'll break it.",
  Hacker: "Every firewall cracks. Yours just cracks faster.",
  Investigator: "Everyone lies. The data never does.",
  Scoundrel: "I was never here—and neither was your loot.",
};

function getField(obj, keys, fallback = "") {
  for (const k of keys) {
    const val = obj?.[k];
    if (val !== undefined && val !== null && String(val).trim() !== "") return val;
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
  constructor(resolver, ttsOrLaunch, maybeLaunch) {
    this.resolver = resolver;
    if (typeof ttsOrLaunch === "function") {
      this.tts = null;
      this.onLaunch = ttsOrLaunch;
    } else {
      this.tts = ttsOrLaunch;
      this.onLaunch = maybeLaunch;
    }

    this.locations = [];
    this.characters = [];
    this.filteredCharacters = [];
    this.currentIndex = 0;

    this.selectedLocation = null;
    this.selectedCharacter = null;
    this.selectedLevel = 1;

    this.filterOrigin = "ALL";
    this.filterClass = "ALL";
    this.searchQuery = "";
    this.viewMode = "carousel"; // "carousel" (default) | "grid" (auto on filter)

    this.voicePreviewEnabled = true;
    this.liveVoicePreview = false;

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
        padding: 14px 24px; border-bottom: 1px solid rgba(0, 240, 255, 0.3);
        background: rgba(8, 14, 28, 0.85);
      }
      .c2185-launch-header h1 {
        margin: 0; font-size: 18px; color: #00f0ff; letter-spacing: 0.1em; text-transform: uppercase;
      }
      .c2185-launch-sub { font-size: 12px; color: #94a3b8; }
      .c2185-audio-controls { display: flex; gap: 14px; align-items: center; font-size: 12px; color: #cbd5e1; }
      .c2185-audio-controls label { display: flex; align-items: center; gap: 5px; cursor: pointer; }
      .c2185-launch-main {
        flex: 1; display: grid; grid-template-columns: 260px 1fr 290px; gap: 16px;
        padding: 16px 24px; overflow: hidden;
      }
      @media (max-width: 1100px) {
        .c2185-launch-main { grid-template-columns: 1fr; overflow-y: auto; }
      }
      .c2185-col {
        background: rgba(8, 14, 28, 0.86); border: 1px solid rgba(0, 240, 255, 0.25);
        border-radius: 12px; padding: 14px; display: flex; flex-direction: column; overflow: hidden;
      }
      .c2185-col h2 {
        margin: 0 0 10px; font-size: 12px; color: #00f0ff; text-transform: uppercase;
        letter-spacing: 0.08em; border-bottom: 1px solid rgba(0, 240, 255, 0.2); padding-bottom: 6px;
        display: flex; justify-content: space-between; align-items: center;
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
      .c2185-filters { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; align-items: center; }
      .c2185-filters select, .c2185-filters input {
        background: #0f172a; color: #fff; border: 1px solid #38bdf8;
        border-radius: 6px; padding: 6px 8px; font-size: 12px;
      }
      .c2185-filters input { flex: 1; min-width: 120px; }
      .c2185-mode-btn {
        background: #1e293b; color: #00f0ff; border: 1px solid rgba(0, 240, 255, 0.5);
        border-radius: 6px; padding: 6px 10px; font-size: 11.5px; font-weight: 700; cursor: pointer;
      }
      .c2185-mode-btn:hover { background: #00f0ff; color: #050811; }

      /* Spotlight Carousel Layout matching sketch */
      .c2185-carousel {
        flex: 1; display: grid; grid-template-columns: 52px minmax(220px, 310px) 1fr 52px;
        gap: 16px; align-items: center; overflow: hidden; padding: 4px 2px;
      }
      @media (max-width: 820px) {
        .c2185-carousel { grid-template-columns: 42px 1fr 42px; }
      }
      .c2185-nav-btn {
        height: 76px; width: 48px; border-radius: 12px;
        background: rgba(15, 23, 42, 0.92); color: #00f0ff;
        border: 2px solid rgba(0, 240, 255, 0.55); font-size: 24px; font-weight: 800;
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        transition: transform 0.12s ease, background 0.15s ease;
      }
      .c2185-nav-btn:hover { background: #00f0ff; color: #050811; transform: scale(1.06); }
      .c2185-portrait-frame {
        height: 100%; max-height: 460px; min-height: 300px;
        border-radius: 28px; border: 2px solid rgba(0, 240, 255, 0.65);
        background: radial-gradient(circle at top, #1e1b4b, #050811 80%);
        box-shadow: 0 0 26px rgba(0, 240, 255, 0.2);
        position: relative; overflow: hidden; display: flex; flex-direction: column;
        align-items: center; justify-content: center;
      }
      .c2185-portrait-frame img { width: 100%; height: 100%; object-fit: cover; }
      .c2185-portrait-initials { font-size: 64px; font-weight: 800; color: #ff2a85; letter-spacing: 0.08em; }
      .c2185-portrait-footer {
        position: absolute; left: 10px; right: 10px; bottom: 10px;
        display: flex; justify-content: space-between; align-items: center; gap: 6px;
        background: rgba(5, 8, 17, 0.86); border: 1px solid rgba(0, 240, 255, 0.35);
        border-radius: 12px; padding: 6px 10px; backdrop-filter: blur(6px);
      }
      .c2185-voice-tag { font-size: 10.5px; color: #fbbf24; font-family: monospace; }
      .c2185-speak-btn {
        background: #ff2a85; color: #fff; border: none; border-radius: 6px;
        padding: 4px 8px; font-size: 11px; font-weight: 700; cursor: pointer;
      }
      .c2185-speak-btn:hover { filter: brightness(1.15); }
      .c2185-stats-box {
        height: 100%; max-height: 460px; overflow-y: auto;
        background: #050811; border: 1px solid rgba(56, 189, 248, 0.45);
        border-radius: 12px; padding: 14px 16px; font-size: 12.5px; line-height: 1.48;
      }
      .c2185-stats-box h3 { margin: 0 0 4px; font-size: 18px; color: #fff; }
      .c2185-submeta { font-size: 12px; color: #00f0ff; font-weight: 600; margin-bottom: 8px; }
      .c2185-flavor-quote {
        margin: 8px 0 10px; padding: 8px 10px; border-left: 3px solid #ff2a85;
        background: rgba(255, 42, 133, 0.1); color: #fbcfe8; font-style: italic; border-radius: 4px;
      }
      .c2185-kv { margin: 5px 0; color: #cbd5e1; }
      .c2185-kv strong { color: #38bdf8; }

      /* Filtered Grid View */
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
        font-size: 24px; font-weight: 800; color: #ff2a85;
      }
      .c2185-avatar img { width: 100%; height: 100%; object-fit: cover; }
      .c2185-char-name { font-size: 13px; font-weight: 700; color: #fff; }
      .c2185-char-meta { font-size: 11px; color: #94a3b8; }

      /* Right Column: Difficulty & Launch */
      .c2185-tier-btn {
        width: 100%; text-align: left; background: #0f172a; color: #e2f1ff;
        border: 1px solid #334155; border-radius: 7px; padding: 7px 10px;
        margin-bottom: 6px; cursor: pointer; font-size: 12px;
      }
      .c2185-tier-btn.active { border-color: #ff2a85; background: rgba(255, 42, 133, 0.16); }
      .c2185-level-row { display: flex; align-items: center; gap: 10px; margin: 10px 0 12px; font-size: 12px; }
      .c2185-level-row input { flex: 1; accent-color: #00f0ff; }
      .c2185-build-box {
        background: #050811; border: 1px solid #1e293b; border-radius: 8px;
        padding: 10px; font-size: 12px; line-height: 1.45; color: #cbd5e1;
      }
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
        <div class="c2185-audio-controls">
          <label><input type="checkbox" id="cs-voice-preview" checked /> Flavor Voice on Advance</label>
          <label title="Unchecked = plays cached carbasset MP3 or browser voice (0 API calls). Checked = streams ElevenLabs live.">
            <input type="checkbox" id="cs-live-preview" /> Live ElevenLabs Audition
          </label>
        </div>
      </header>
      <main class="c2185-launch-main">
        <section class="c2185-col">
          <h2>1. Starting Location</h2>
          <div class="c2185-scroll" id="cs-locations"></div>
        </section>

        <section class="c2185-col">
          <h2>
            <span>2. Select Operative</span>
            <span id="cs-counter" style="color:#fbbf24;font-family:monospace;">1 / 60</span>
          </h2>
          <div class="c2185-filters">
            <select id="cs-origin-filter"><option value="ALL">All Origins</option></select>
            <select id="cs-class-filter"><option value="ALL">All Classes</option></select>
            <input id="cs-search" type="text" placeholder="Search operative..." />
            <button type="button" class="c2185-mode-btn" id="cs-mode-btn">Grid View</button>
          </div>
          <div id="cs-stage" style="flex:1;display:flex;flex-direction:column;overflow:hidden;"></div>
        </section>

        <section class="c2185-col">
          <h2>3. Difficulty & Level Build</h2>
          <div class="c2185-scroll">
            <div id="cs-tiers"></div>
            <div class="c2185-level-row">
              <span>Custom Level:</span>
              <input id="cs-level-slider" type="range" min="1" max="20" value="1" />
              <strong id="cs-level-val" style="color:#00f0ff;min-width:40px;">Lv. 1</strong>
            </div>
            <div class="c2185-build-box" id="cs-level-build">
              <em>Select a character to inspect their level build-out.</em>
            </div>
          </div>
          <button class="c2185-launch-btn" id="cs-launch-btn" disabled>Launch 360° Session</button>
        </section>
      </main>
    `;
    document.body.appendChild(this.el);

    this.el.querySelector("#cs-voice-preview").onchange = (e) => {
      this.voicePreviewEnabled = e.target.checked;
      if (!this.voicePreviewEnabled) this._stopSampleAudio();
    };
    this.el.querySelector("#cs-live-preview").onchange = (e) => {
      this.liveVoicePreview = e.target.checked;
    };

    const onFilterChange = () => {
      this._applyFilters();
      const hasFilter = this.filterOrigin !== "ALL" || this.filterClass !== "ALL" || this.searchQuery !== "";
      this.viewMode = hasFilter ? "grid" : "carousel";
      this._renderStage();
    };

    this.el.querySelector("#cs-origin-filter").onchange = (e) => {
      this.filterOrigin = e.target.value;
      onFilterChange();
    };
    this.el.querySelector("#cs-class-filter").onchange = (e) => {
      this.filterClass = e.target.value;
      onFilterChange();
    };
    this.el.querySelector("#cs-search").oninput = (e) => {
      this.searchQuery = e.target.value.toLowerCase().trim();
      onFilterChange();
    };
    this.el.querySelector("#cs-mode-btn").onclick = () => {
      this.viewMode = this.viewMode === "carousel" ? "grid" : "carousel";
      this._renderStage();
    };
    this.el.querySelector("#cs-level-slider").oninput = (e) => {
      this._setLevel(parseInt(e.target.value, 10));
    };
    this.el.querySelector("#cs-launch-btn").onclick = () => {
      if (!this.selectedLocation || !this.selectedCharacter) return;
      this._stopSampleAudio();
      this.hide();
      this.onLaunch({
        location: this.selectedLocation,
        character: this.selectedCharacter,
        level: this.selectedLevel,
      });
    };

    // Keyboard Left/Right arrow support while setup overlay is visible
    window.addEventListener("keydown", (e) => {
      if (this.el.classList.contains("hidden") || this.viewMode !== "carousel") return;
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "SELECT") return;
      if (e.key === "ArrowLeft") this.stepCharacter(-1);
      if (e.key === "ArrowRight") this.stepCharacter(1);
    });
  }

  async init() {
    await this.resolver.init(true);

    const rawLocs = this.resolver.getCollection("Locations");
    this.locations = [...rawLocs].sort((a, b) => {
      const aReady = a.image_360 ? 1 : 0;
      const bReady = b.image_360 ? 1 : 0;
      return bReady - aReady || a.name.localeCompare(b.name);
    });

    this.characters = this.resolver.getCollection("Premade_Characters");
    this.selectedLocation = this.locations[0] || null;

    this._populateFilters();
    this._applyFilters();
    this._renderLocations();
    this._renderTiers();
    this._renderStage();

    const ready360 = this.locations.filter((l) => Boolean(l.image_360)).length;
    this.el.querySelector("#cs-status").textContent =
      `Ready — ${this.locations.length} Locations (${ready360} with 360° scenes) • ${this.characters.length} Playable Operatives`;
    this._updateLaunchState();
  }

  _populateFilters() {
    const origins = new Set();
    const classes = new Set();
    this.characters.forEach((c) => {
      const o = getField(c, ["origin", "origin_race", "race"]);
      const cl = getField(c, ["class", "character_class"]);
      if (o) origins.add(o);
      if (cl) classes.add(cl);
    });

    const originSel = this.el.querySelector("#cs-origin-filter");
    [...origins].sort().forEach((o) => {
      const opt = document.createElement("option");
      opt.value = o; opt.textContent = o;
      originSel.appendChild(opt);
    });

    const classSel = this.el.querySelector("#cs-class-filter");
    [...classes].sort().forEach((cl) => {
      const opt = document.createElement("option");
      opt.value = cl; opt.textContent = cl;
      classSel.appendChild(opt);
    });
  }

  _applyFilters() {
    this.filteredCharacters = this.characters.filter((c) => {
      const origin = getField(c, ["origin", "origin_race", "race"]);
      const cls = getField(c, ["class", "character_class"]);
      if (this.filterOrigin !== "ALL" && origin !== this.filterOrigin) return false;
      if (this.filterClass !== "ALL" && cls !== this.filterClass) return false;
      if (this.searchQuery && !c.name.toLowerCase().includes(this.searchQuery)) return false;
      return true;
    });

    const existingIdx = this.selectedCharacter
      ? this.filteredCharacters.findIndex((c) => c.id === this.selectedCharacter.id)
      : -1;
    this.currentIndex = existingIdx >= 0 ? existingIdx : 0;
    this.selectedCharacter = this.filteredCharacters[this.currentIndex] || null;
  }

  stepCharacter(delta) {
    if (!this.filteredCharacters.length) return;
    this.currentIndex = (this.currentIndex + delta + this.filteredCharacters.length) % this.filteredCharacters.length;
    this.selectedCharacter = this.filteredCharacters[this.currentIndex];
    this._renderStage();
    this._playCharacterSample(this.selectedCharacter);
  }

  _getFlavorLine(char) {
    const custom = getField(char, ["flavor_line", "flavor_line_3_8_words", "catchphrase"]);
    if (custom) return String(custom).replace(/^["']|["']$/g, "");
    const cls = getField(char, ["class", "character_class"], "Scoundrel");
    return FALLBACK_FLAVOR_BY_CLASS[cls] || "Chrome hot. Eyes open. Let's run.";
  }

  _stopSampleAudio() {
    if (this.tts) this.tts.stop();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }

  async _playCharacterSample(char) {
    if (!this.voicePreviewEnabled || !char) return;
    this._stopSampleAudio();

    const line = this._getFlavorLine(char);
    const role = getField(char, ["voice_role"], "Street");
    const slug = char.slug || char.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

    // 1. Play cached carbasset MP3 if available (0 API calls), or stream live if user opted in
    if (this.tts) {
      await this.tts.init();
      const cached = this.tts.findCachedClip({ text: line, speaker: slug, role, intent: "flavor" });
      if (cached || this.liveVoicePreview) {
        await this.tts.speak(line, {
          role,
          speaker: slug,
          intent: "flavor",
          cacheOnly: !this.liveVoicePreview,
        });
        return;
      }
    }

    // 2. Instant zero-cost Web Speech fallback until the character's .mp3 is archived in carbasset
    if ("speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(line);
      if (role === "Synth") { u.pitch = 0.85; u.rate = 1.08; }
      else if (role === "Corpo") { u.pitch = 1.05; u.rate = 0.98; }
      else { u.pitch = 0.9; u.rate = 1.02; }
      window.speechSynthesis.speak(u);
    }
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

  _renderStage() {
    const stage = this.el.querySelector("#cs-stage");
    const modeBtn = this.el.querySelector("#cs-mode-btn");
    const counter = this.el.querySelector("#cs-counter");

    modeBtn.textContent = this.viewMode === "carousel" ? "Grid View" : "Spotlight View";
    counter.textContent = this.filteredCharacters.length
      ? `${this.currentIndex + 1} / ${this.filteredCharacters.length}`
      : "0 / 0";

    this._renderLevelBuild();
    this._updateLaunchState();

    if (!this.filteredCharacters.length) {
      stage.innerHTML = `<div style="color:#94a3b8;font-size:13px;padding:24px;">No operatives match your current filter.</div>`;
      return;
    }

    if (this.viewMode === "grid") {
      this._renderGrid(stage);
    } else {
      this._renderCarousel(stage);
    }
  }

  _renderCarousel(stage) {
    const c = this.selectedCharacter || this.filteredCharacters[0];
    const origin = getField(c, ["origin", "origin_race", "race"], "Unknown");
    const cls = getField(c, ["class", "character_class"], "Operative");
    const archetype = getField(c, ["archetype_subclass"], "");
    const voiceRole = getField(c, ["voice_role"], "Street");
    const voiceDesc = getField(c, ["voice_type_description", "voice_description"], `${voiceRole} archetype voice`);
    const flavorLine = this._getFlavorLine(c);
    const stats = getField(c, ["ability_scores_str_dex_con_int_wis_cha", "stats", "ability_scores"], "");
    const skills = getField(c, ["skill_proficiencies", "skills"], "Streetwise, Perception");
    const weapons = getField(c, ["starter_weapons_gear", "starter_weapons", "weapons"], "Standard Sidearm");
    const knowledge = getField(c, ["knowledge_domains"], "");
    const influence = getField(c, ["faction_influence"], "");
    const backstory = getField(c, ["backstory", "lore_bio_stats", "bio"], "No dossier text.");

    const hasPortrait = c.image_2d && c.image_status !== "PLACEHOLDER";
    const portraitHtml = hasPortrait
      ? `<img src="${c.image_2d}" alt="${c.name}" onerror="this.remove();" />`
      : `<div class="c2185-portrait-initials">${getInitials(c.name)}</div>`;

    stage.innerHTML = `
      <div class="c2185-carousel">
        <button type="button" class="c2185-nav-btn" id="cs-prev" title="Previous Operative (Left Arrow)">◀</button>

        <div class="c2185-portrait-frame">
          ${portraitHtml}
          <div class="c2185-portrait-footer">
            <span class="c2185-voice-tag">VOICE: ${voiceRole.toUpperCase()}</span>
            <button type="button" class="c2185-speak-btn" id="cs-replay-voice">🔊 Sample</button>
          </div>
        </div>

        <div class="c2185-stats-box">
          <h3>${c.name}</h3>
          <div class="c2185-submeta">${origin} • ${cls}${archetype ? ` (${archetype})` : ""}</div>
          <div class="c2185-flavor-quote">"${flavorLine}"</div>
          <div class="c2185-kv"><strong>Voice Profile:</strong> ${voiceDesc}</div>
          ${stats ? `<div class="c2185-kv"><strong>Ability Scores:</strong> ${stats}</div>` : ""}
          <div class="c2185-kv"><strong>Skills:</strong> ${skills}</div>
          <div class="c2185-kv"><strong>Starter Gear:</strong> ${weapons}</div>
          ${knowledge ? `<div class="c2185-kv"><strong>Knowledge:</strong> ${knowledge}</div>` : ""}
          ${influence ? `<div class="c2185-kv"><strong>Influence:</strong> ${influence}</div>` : ""}
          <div class="c2185-kv" style="margin-top:8px;"><strong>Dossier:</strong> ${backstory}</div>
        </div>

        <button type="button" class="c2185-nav-btn" id="cs-next" title="Next Operative (Right Arrow)">▶</button>
      </div>
    `;

    stage.querySelector("#cs-prev").onclick = () => this.stepCharacter(-1);
    stage.querySelector("#cs-next").onclick = () => this.stepCharacter(1);
    stage.querySelector("#cs-replay-voice").onclick = () => this._playCharacterSample(c);
  }

  _renderGrid(stage) {
    stage.innerHTML = `<div class="c2185-scroll"><div class="c2185-char-grid" id="cs-char-grid"></div></div>`;
    const grid = stage.querySelector("#cs-char-grid");

    this.filteredCharacters.forEach((char, idx) => {
      const origin = getField(char, ["origin", "origin_race", "race"], "Unknown");
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
        this.currentIndex = idx;
        this.selectedCharacter = char;
        this.viewMode = "carousel";
        this._renderStage();
        this._playCharacterSample(char);
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
    this._renderLevelBuild();
  }

  _renderLevelBuild() {
    const box = this.el.querySelector("#cs-level-build");
    const c = this.selectedCharacter;
    if (!c) {
      box.innerHTML = `<em>Select an operative to inspect their level build-out.</em>`;
      return;
    }

    const buildJson = c.level_1_20_build_out_json;
    let levelText = "";
    if (buildJson && typeof buildJson === "object") {
      levelText = buildJson[`Lv${this.selectedLevel}`] || buildJson[`level_${this.selectedLevel}`] || "";
    }
    if (!levelText) {
      levelText = getField(c, [`level_${this.selectedLevel}`, `lv_${this.selectedLevel}`], "Standard operative scaling active.");
    }

    box.innerHTML = `
      <div style="color:#00f0ff;font-weight:700;margin-bottom:4px;">${c.name} — Level ${this.selectedLevel}</div>
      <div>${typeof levelText === "object" ? JSON.stringify(levelText) : levelText}</div>
    `;
  }

  _updateLaunchState() {
    this.el.querySelector("#cs-launch-btn").disabled = !(this.selectedLocation && this.selectedCharacter);
  }

  show() { this.el.classList.remove("hidden"); }
  hide() { this.el.classList.add("hidden"); }
}
