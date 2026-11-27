// visorHud.js — Task 4.4: Cybernetic Visor HUD, Quick-Action Dock, Gear Pills & Voice Commands
export class VisorHud {
  constructor(callbacks = {}) {
    this.onAction = callbacks.onAction || (() => {});
    this.onInspect = callbacks.onInspect || (() => {});
    this.onVoiceCommand = callbacks.onVoiceCommand || (() => {});
    this.liveVoiceEnabled = false; // Defaults to cache-first (0 API calls) during playtesting

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
      .c2185-visor-row {
        display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;
      }
      .c2185-vitals { display: flex; gap: 14px; font-family: monospace; font-size: 12px; }
      .c2185-vitals span strong { color: #00f0ff; }
      .c2185-vitals .stress strong { color: #ff2a85; }
      .c2185-vitals .money strong { color: #fbbf24; }
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
      .c2185-roll-feed {
        pointer-events: auto; width: 100%; box-sizing: border-box; display: none;
        background: rgba(5, 8, 17, 0.92); border-left: 3px solid #00f0ff;
        border-radius: 8px; padding: 8px 12px; font-size: 12.5px; line-height: 1.4;
      }
      .c2185-roll-feed.fail { border-left-color: #ff2a85; }
      .c2185-roll-badge { font-family: monospace; font-size: 11.5px; font-weight: 700; margin-bottom: 3px; }
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
            <label class="c2185-toggle" title="Unchecked = 0 ElevenLabs calls (cached clips). Checked = live Cloudflare proxy narration.">
              <input type="checkbox" id="vh-live-voice" />
              Live AI Voice
            </label>
          </div>
        </div>
        <div class="c2185-gear-bar" id="vh-gear-bar">
          <span>Quick Inspect:</span>
        </div>
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
    if (!SpeechRec) {
      pttBtn.disabled = true;
      pttBtn.title = "Voice commands require Chrome or Edge";
      return;
    }

    const rec = new SpeechRec();
    rec.lang = "en-US";
    rec.interimResults = false;

    pttBtn.onclick = () => {
      pttBtn.classList.add("listening");
      pttBtn.textContent = "Listening...";
      try {
        rec.start();
      } catch {
        rec.stop();
      }
    };

    rec.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript || "";
      if (transcript) this.onVoiceCommand(transcript);
    };
    rec.onend = () => {
      pttBtn.classList.remove("listening");
      pttBtn.textContent = "Mic Command";
    };
  }

  show() {
    this.el.style.display = "flex";
  }

  updateVitals(v) {
    this.el.querySelector("#vh-hp").textContent = `${v.hp}/${v.maxHp}`;
    this.el.querySelector("#vh-stress").textContent = `${v.stress}/${v.maxStress}`;
    this.el.querySelector("#vh-money").textContent = v.wonlongs.toLocaleString();
  }

  setGearPills(character) {
    const bar = this.el.querySelector("#vh-gear-bar");
    bar.innerHTML = `<span>Quick Inspect:</span>`;

    const rawWeapons = String(character?.starter_weapons || character?.weapons || "");
    const starterList = rawWeapons
      .split(/[,;/]+/)
      .map((s) => s.replace(/\(.*?\)/g, "").trim())
      .filter((s) => s.length > 2)
      .slice(0, 2);

    const pills = [...new Set([...starterList, "Stun Baton", "Biolink Gun"])];
    pills.forEach((name) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "c2185-gear-pill";
      btn.textContent = name;
      btn.onclick = () => this.onInspect(name);
      bar.appendChild(btn);
    });
  }

  showRollResult(res) {
    const feed = this.el.querySelector("#vh-feed");
    feed.style.display = "block";
    feed.className = `c2185-roll-feed ${res.success ? "" : "fail"}`;
    const tagColor = res.success ? "#00f0ff" : "#ff2a85";
    const verdict = res.critSuccess
      ? "CRITICAL SUCCESS"
      : res.critFail
      ? "CRITICAL FAIL"
      : res.success
      ? "SUCCESS"
      : "FAILED";

    feed.innerHTML = `
      <div class="c2185-roll-badge" style="color:${tagColor}">
        [${res.skill.toUpperCase()}] d20(${res.d20}) + ${res.modifier} = ${res.total} vs DC ${res.dc} — ${verdict}
      </div>
      <div>${res.narrative}</div>
    `;
  }
}
