// visorHud.js — Cybernetic Visor HUD with Tech Reveal Animation, Pin Status & Dynamic Gear Pills
export class VisorHud {
  constructor(callbacks = {}) {
    this.onAction = callbacks.onAction || (() => {});
    this.onInspect = callbacks.onInspect || (() => {});
    this.onVoiceCommand = callbacks.onVoiceCommand || (() => {});
    this.liveVoiceEnabled = false;
    this._revealTimer = null;
    this._revealTimeout = null;
    this._gearSet = new Set();

    this._injectStyles();
    this._buildDom();
    this._setupVoiceRecognition();
  }

  _injectStyles() {
    if (document.getElementById("c2185-visor-styles")) return;
    const style = document.createElement("style");
    style.id = "c2185-visor-styles";
    style.textContent = `
      .c2185-visor-dock {
        position: fixed; left: 50%; bottom: 64px; transform: translateX(-50%); z-index: 22;
        display: flex; flex-direction: column; align-items: center; gap: 8px;
        width: min(760px, calc(100vw - 24px)); pointer-events: none;
      }
      .c2185-visor-panel {
        pointer-events: auto; width: 100%; box-sizing: border-box;
        background: rgba(8, 14, 28, 0.88); border: 1px solid rgba(0, 240, 255, 0.45);
        border-radius: 14px; padding: 10px 14px; backdrop-filter: blur(8px);
        box-shadow: 0 0 24px rgba(0, 240, 255, 0.16);
      }
      .c2185-visor-row { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
      .c2185-vitals { display: flex; gap: 14px; font-family: monospace; font-size: 12px; }
      .c2185-vitals span strong { color: #00f0ff; }
      .c2185-vitals .stress strong { color: #ff2a85; }
      .c2185-vitals .money strong { color: #fbbf24; }
      .c2185-pin-tag { font-family: monospace; font-size: 11px; color: #fbbf24; margin-top: 6px; }
      .c2185-actions { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
      .c2185-act-btn {
        background: #0f172a; color: #e2f1ff; border: 1px solid #38bdf8;
        border-radius: 6px; padding: 6px 10px; font-size: 11.5px; font-weight: 700;
        cursor: pointer; text-transform: uppercase; letter-spacing: 0.04em;
      }
      .c2185-act-btn:hover { background: #00f0ff; color: #050811; }
      .c2185-act-btn.ptt { border-color: #ff2a85; color: #ff2a85; }
      .c2185-act-btn.ptt.listening { background: #ff2a85; color: #fff; }
      .c2185-gear-bar {
        display: flex; gap: 6px; flex-wrap: wrap; align-items: center;
        margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(56, 189, 248, 0.2);
        font-size: 11px; color: #94a3b8;
      }
      .c2185-gear-pill {
        background: rgba(0, 240, 255, 0.12); color: #a5f3fc; border: 1px solid rgba(0, 240, 255, 0.4);
        border-radius: 999px; padding: 3px 9px; font-size: 11px; cursor: pointer;
      }
      .c2185-gear-pill:hover { background: #00f0ff; color: #050811; }
      .c2185-gear-pill.new-loot {
        border-color: #fbbf24; color: #fde68a; background: rgba(251, 191, 36, 0.18);
        box-shadow: 0 0 10px rgba(251, 191, 36, 0.35);
      }
      .c2185-roll-feed {
        pointer-events: auto; width: 100%; box-sizing: border-box; display: none;
        position: relative; overflow: hidden;
        background: rgba(5, 8, 17, 0.94); border: 1px solid rgba(0, 240, 255, 0.35);
        border-left: 3px solid #00f0ff; border-radius: 8px;
        padding: 9px 12px; font-size: 12.5px; line-height: 1.4;
      }
      .c2185-roll-feed.fail { border-left-color: #ff2a85; border-color: rgba(255, 42, 133, 0.45); }
      .c2185-roll-feed.scanning { border-left-color: #fbbf24; border-color: rgba(251, 191, 36, 0.45); }
      .c2185-roll-feed.reveal-pop { animation: c2185RevealLock 0.35s ease-out; }
      @keyframes c2185RevealLock {
        0% { transform: scale(0.985); box-shadow: 0 0 24px rgba(0, 240, 255, 0.55); }
        100% { transform: scale(1); box-shadow: none; }
      }
      .c2185-scan-track {
        height: 3px; width: 100%; background: rgba(56, 189, 248, 0.18);
        border-radius: 2px; margin-top: 6px; overflow: hidden;
      }
      .c2185-scan-fill {
        height: 100%; width: 0%;
        background: linear-gradient(90deg, #00f0ff, #fbbf24);
        animation: c2185ScanFill 0.7s linear forwards;
      }
      @keyframes c2185ScanFill { from { width: 0%; } to { width: 100%; } }
      .c2185-roll-badge { font-family: monospace; font-size: 11.5px; font-weight: 700; margin-bottom: 3px; }
      .c2185-loot-tag {
        margin-top: 5px; font-family: monospace; font-size: 11px; color: #fbbf24;
      }
      .c2185-toggle { font-size: 11px; color: #94a3b8; display: flex; align-items: center; gap: 4px; cursor: pointer; }
    `;
    document.head.appendChild(style);
  }

  _buildDom() {
    this.el = document.createElement("div");
    this.el.className = "c2185-visor-dock";
    this.el.style.display = "none";
    this.el.innerHTML = `
      <div class="c2185-roll-feed" id="vh-feed"></div>
      <div class="c2185-visor-panel">
        <div class="c2185-visor-row">
          <div class="c2185-vitals">
            <span>HP <strong id="vh-hp">16/16</strong></span>
            <span class="stress">STRESS <strong id="vh-stress">0/10</strong></span>
            <span class="money">₩ <strong id="vh-money">750</strong></span>
          </div>
          <div class="c2185-actions">
            <button class="c2185-act-btn" data-skill="Investigation">Investigate</button>
            <button class="c2185-act-btn" data-skill="Hack">Hack</button>
            <button class="c2185-act-btn" data-skill="Attack">Attack</button>
            <button class="c2185-act-btn ptt" id="vh-ptt">Mic Command</button>
            <label class="c2185-toggle">
              <input type="checkbox" id="vh-live-voice" />
              Live AI Voice
            </label>
          </div>
        </div>
        <div class="c2185-pin-tag" id="vh-pin-tag">PIN: Click anywhere in the 360° scene to drop a target pin.</div>
        <div class="c2185-gear-bar" id="vh-gear-bar"><span>Quick Inspect:</span></div>
      </div>
    `;
    document.body.appendChild(this.el);

    this.el.querySelectorAll("[data-skill]").forEach((btn) => {
      btn.onclick = () => this.onAction(btn.dataset.skill);
    });
    this.el.querySelector("#vh-live-voice").onchange = (e) => {
      this.liveVoiceEnabled = e.target.checked;
    };
  }

  _setupVoiceRecognition() {
    const pttBtn = this.el.querySelector("#vh-ptt");
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) { pttBtn.disabled = true; return; }
    const rec = new SpeechRec();
    rec.lang = "en-US"; rec.interimResults = false;
    pttBtn.onclick = () => {
      pttBtn.classList.add("listening"); pttBtn.textContent = "Listening...";
      try { rec.start(); } catch { rec.stop(); }
    };
    rec.onresult = (e) => {
      const t = e.results[0]?.[0]?.transcript || "";
      if (t) this.onVoiceCommand(t);
    };
    rec.onend = () => { pttBtn.classList.remove("listening"); pttBtn.textContent = "Mic Command"; };
  }

  show() { this.el.style.display = "flex"; }

  setPinStatus(text) {
    this.el.querySelector("#vh-pin-tag").textContent = text;
  }

  updateVitals(v) {
    this.el.querySelector("#vh-hp").textContent = `${v.hp}/${v.maxHp}`;
    this.el.querySelector("#vh-stress").textContent = `${v.stress}/${v.maxStress}`;
    this.el.querySelector("#vh-money").textContent = v.wonlongs.toLocaleString();
  }

  setGearPills(character) {
    const bar = this.el.querySelector("#vh-gear-bar");
    bar.innerHTML = `<span>Quick Inspect:</span>`;
    this._gearSet.clear();

    const rawWeapons = String(character?.starter_weapons || character?.weapons || "");
    const starterList = rawWeapons
      .split(/[,;/]+/)
      .map((s) => s.replace(/\(.*?\)/g, "").trim())
      .filter((s) => s.length > 2)
      .slice(0, 2);

    [...new Set([...starterList, "Stun Baton", "Biolink Gun"])].forEach((name) => {
      this.addGearPill(name, false);
    });
  }

  addGearPill(name, highlightNew = true) {
    if (!name || this._gearSet.has(name.toLowerCase())) return;
    this._gearSet.add(name.toLowerCase());
    const bar = this.el.querySelector("#vh-gear-bar");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `c2185-gear-pill ${highlightNew ? "new-loot" : ""}`;
    btn.textContent = highlightNew ? `★ ${name}` : name;
    btn.onclick = () => this.onInspect(name);
    bar.appendChild(btn);
  }

  /**
   * Plays a ~700ms tech-based telemetry scan & d20 scramble before locking onto the final result.
   * Returns a Promise that resolves as soon as the final result is revealed.
   */
  showRollResult(res) {
    const feed = this.el.querySelector("#vh-feed");
    clearInterval(this._revealTimer);
    clearTimeout(this._revealTimeout);

    feed.style.display = "block";
    feed.className = "c2185-roll-feed scanning";

    const hexChars = "0123456789ABCDEF";
    const randHex = () =>
      Array.from({ length: 4 }, () => hexChars[Math.floor(Math.random() * 16)]).join("");

    const renderScanFrame = () => {
      const fakeDie = String(Math.floor(Math.random() * 20) + 1).padStart(2, "0");
      feed.innerHTML = `
        <div class="c2185-roll-badge" style="color:#fbbf24">
          [${res.skill.toUpperCase()}] TELEMETRY SCAN // d20(${fakeDie}) // 0x${randHex()}
        </div>
        <div style="color:#94a3b8;font-family:monospace;font-size:11.5px;">
          Decrypting neural check outcome...
        </div>
        <div class="c2185-scan-track"><div class="c2185-scan-fill"></div></div>
      `;
    };

    renderScanFrame();
    this._revealTimer = setInterval(() => {
      const badgeEl = feed.querySelector(".c2185-roll-badge");
      if (!badgeEl) return;
      const fakeDie = String(Math.floor(Math.random() * 20) + 1).padStart(2, "0");
      badgeEl.textContent = `[${res.skill.toUpperCase()}] TELEMETRY SCAN // d20(${fakeDie}) // 0x${randHex()}`;
    }, 55);

    return new Promise((resolve) => {
      this._revealTimeout = setTimeout(() => {
        clearInterval(this._revealTimer);
        feed.className = `c2185-roll-feed reveal-pop ${res.success ? "" : "fail"}`;
        const color = res.success ? "#00f0ff" : "#ff2a85";

        let badge = "";
        if (res.autofail) {
          badge = `[${res.skill.toUpperCase()}] AUTOFAIL`;
        } else {
          const modeTag =
            res.rollMode === "advantage"
              ? `ADV (${res.rolls.join(", ")})`
              : res.rollMode === "disadvantage"
              ? `DISADV (${res.rolls.join(", ")})`
              : `d20(${res.d20})`;
          const proxTag = res.proximityBand ? ` • ${res.proximityBand} (${res.distanceDeg}°)` : "";
          const verdict = res.critSuccess
            ? "CRIT SUCCESS"
            : res.critFail
            ? "CRIT FAIL"
            : res.success
            ? "SUCCESS"
            : "FAILED";
          badge = `[${res.skill.toUpperCase()}] ${modeTag} + ${res.modifier} = ${res.total} vs DC ${res.dc}${proxTag} — ${verdict}`;
        }

        const lootHtml = res.acquiredItem
          ? `<div class="c2185-loot-tag">★ ACQUIRED OBJECT: ${res.acquiredItem} — Loading stats overlay...</div>`
          : "";

        feed.innerHTML = `
          <div class="c2185-roll-badge" style="color:${color}">${badge}</div>
          <div>${res.narrative}</div>
          ${lootHtml}
        `;
        resolve();
      }, 700);
    });
  }
}
