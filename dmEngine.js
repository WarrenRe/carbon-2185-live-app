// dmEngine.js — Spatial Proximity Investigation, Advantage/Disadvantage, One-Shot Autofail & Loot Acquisition
const CLOSE_DEG = 10;     // Bullseye: Advantage + DC -3
const MID_DEG = 22;       // Mid-range: Normal roll + Base DC
const OUTER_RIM_DEG = 35; // Outer rim: Disadvantage + DC +3 (fail = permanently burned)
const DEAD_ZONE_DEG = 16; // Re-searching a dead/exhausted spot within 16° = Autofail

function yawPitchToUnit(yawDeg, pitchDeg) {
  const phi = ((90 - pitchDeg) * Math.PI) / 180;
  const theta = (yawDeg * Math.PI) / 180;
  return {
    x: Math.sin(phi) * Math.cos(theta),
    y: Math.cos(phi),
    z: Math.sin(phi) * Math.sin(theta),
  };
}

function angleBetweenDeg(a, b) {
  const dot = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z));
  return (Math.acos(dot) * 180) / Math.PI;
}

export class DMEngine {
  constructor() {
    this.vitals = { hp: 16, maxHp: 16, stress: 0, maxStress: 10, wonlongs: 750, profBonus: 2 };
    this.pois = [];
    this.searchedZones = [];
    this.acquiredItems = new Set();
  }

  initCharacterVitals(character, level = 1) {
    const lvl = Math.max(1, Math.min(20, Number(level) || 1));
    const maxHp = 10 + lvl * 6;
    const profBonus = Math.floor((lvl - 1) / 4) + 2;
    this.vitals = { hp: maxHp, maxHp, stress: 0, maxStress: 10, wonlongs: 500 + lvl * 250, profBonus };
    this.acquiredItems.clear();
    return this.vitals;
  }

  initLocationPOIs(location) {
    this.searchedZones = [];
    const locName = location?.name || "Sector";
    const source =
      Array.isArray(location?.hotspots) && location.hotspots.length
        ? location.hotspots
        : [
            {
              id: "poi-terminal",
              label: "Encrypted Access Terminal",
              primaryAction: "Hack",
              dc: 13,
              yaw: -35,
              pitch: -4,
              color: "#00f0ff",
              discoverLoot: null,
              actionLoot: "Biolink Gun",
              discoverLine: `Optics lock onto a concealed data jack in ${locName}. Ready to Hack.`,
              actionSuccess: `Firewall cracked in ${locName}. Security locker pops open—Biolink Gun acquired.`,
              actionFail: `Black ICE spikes your neural link. Security drones are rerouting.`,
            },
            {
              id: "poi-cache",
              label: "Hidden Drop-Cache",
              primaryAction: "Hack",
              dc: 12,
              yaw: 32,
              pitch: 2,
              color: "#fbbf24",
              discoverLoot: "Stun Baton",
              actionLoot: "Stun Gloves",
              discoverLine: `You uncover a disguised Dead-Drop cache tucked beneath the neon paneling—Stun Baton recovered.`,
              actionSuccess: `Secondary biometric compartment bypassed—Stun Gloves acquired.`,
              actionFail: `Tamper charge fries the latch. The remaining compartment is wiped.`,
            },
            {
              id: "poi-hostile",
              label: "Concealed Sniper / Drone",
              primaryAction: "Attack",
              dc: 14,
              yaw: 115,
              pitch: -6,
              color: "#ff2a85",
              discoverLoot: null,
              actionLoot: "Shotgun",
              discoverLine: `Thermal glint detected—a hostile optic is tracking you from cover. Ready to Attack.`,
              actionSuccess: `Clean strike through the shadows. Target neutralized—you salvage their Shotgun.`,
              actionFail: `Your shot clips reinforced plating. Hostile return fire grazes your rig.`,
            },
          ];

    this.pois = source.map((p) => ({
      ...p,
      dir: yawPitchToUnit(p.yaw || 0, p.pitch || 0),
      state: "unsearched", // "unsearched" | "discovered" | "burned"
      actionResolved: false,
    }));
    return this.pois;
  }

  _rollD20(mode = "normal") {
    const r1 = Math.floor(Math.random() * 20) + 1;
    if (mode === "normal") return { chosen: r1, rolls: [r1], mode };
    const r2 = Math.floor(Math.random() * 20) + 1;
    const chosen = mode === "advantage" ? Math.max(r1, r2) : Math.min(r1, r2);
    return { chosen, rolls: [r1, r2], mode };
  }

  _getModifier(character, skill) {
    const prof = this.vitals.profBonus;
    const skillsText = String(character?.skills || character?.skill_proficiencies || "").toLowerCase();
    return (skillsText.includes(skill.toLowerCase()) ? prof : Math.floor(prof / 2)) + 2;
  }

  _claimLoot(itemName) {
    if (!itemName || this.acquiredItems.has(itemName)) return null;
    this.acquiredItems.add(itemName);
    return itemName;
  }

  investigatePin({ pinDir, character, level = 1 }) {
    if (!pinDir) {
      return this._autofail("Investigation", "No pin dropped. Point and click a spot in the 360° scene first.");
    }

    let nearest = null;
    let nearestDeg = Infinity;
    for (const poi of this.pois) {
      const deg = angleBetweenDeg(pinDir, poi.dir);
      if (deg <= OUTER_RIM_DEG && deg < nearestDeg) {
        nearest = poi;
        nearestDeg = deg;
      }
    }

    if (nearest && nearest.state === "discovered") {
      return this._autofail("Investigation", `${nearest.label} was already discovered here. Searching again is an autofail—use Hack or Attack on this pin.`);
    }
    if (nearest && nearest.state === "burned") {
      return this._autofail("Investigation", "You already missed the signal in this sector. That object is permanently lost—searching again is an autofail.");
    }

    const alreadySearched = this.searchedZones.some((z) => angleBetweenDeg(pinDir, z.dir) <= DEAD_ZONE_DEG);
    if (alreadySearched && !nearest) {
      return this._autofail("Investigation", "Area already swept. Repeatedly searching the same sector is an autofail.");
    }

    if (!nearest) {
      this.searchedZones.push({ dir: pinDir, outcome: "empty" });
      return this._autofail("Investigation", "Nothing within your 35° scan radius. Area logged as empty.");
    }

    let proximityBand = "MID";
    let dcMod = 0;
    let rollMode = "normal";
    if (nearestDeg <= CLOSE_DEG) {
      proximityBand = "CLOSE (BULLSEYE)";
      dcMod = -3;
      rollMode = "advantage";
    } else if (nearestDeg > MID_DEG) {
      proximityBand = "OUTER RIM";
      dcMod = +3;
      rollMode = "disadvantage";
    }

    const baseDc = nearest.dc || 12;
    const effectiveDc = Math.max(5, baseDc + dcMod);
    const modifier = this._getModifier(character, "Investigation");
    const roll = this._rollD20(rollMode);
    const total = roll.chosen + modifier;

    const critSuccess = roll.chosen === 20;
    const critFail = roll.chosen === 1;
    const success = critSuccess || (!critFail && total >= effectiveDc);

    this.searchedZones.push({ dir: pinDir, outcome: success ? "discovered" : "burned" });

    let acquiredItem = null;
    if (success) {
      nearest.state = "discovered";
      this.vitals.wonlongs += critSuccess ? 200 : 75;
      acquiredItem = this._claimLoot(nearest.discoverLoot);
    } else {
      nearest.state = "burned";
      this.vitals.stress = Math.min(this.vitals.maxStress, this.vitals.stress + (critFail ? 2 : 1));
    }

    const narrative = success
      ? nearest.discoverLine
      : `Scan failed at ${Math.round(nearestDeg)}° off-target. The signal vanished—anything in that radius is no longer discoverable.`;

    return {
      skill: "Investigation",
      label: success ? nearest.label : "Unresolved Sector",
      baseDc,
      dcMod,
      dc: effectiveDc,
      distanceDeg: Math.round(nearestDeg),
      proximityBand,
      rollMode: roll.mode,
      rolls: roll.rolls,
      d20: roll.chosen,
      modifier,
      total,
      success,
      critSuccess,
      critFail,
      autofail: false,
      poi: success ? nearest : null,
      acquiredItem,
      burnedPinDir: success ? null : pinDir,
      narrative,
      cacheIntent: success ? "success" : "failure",
      vitals: { ...this.vitals },
    };
  }

  resolvePinAction({ skill, pinDir, character, level = 1 }) {
    if (!pinDir) {
      return this._autofail(skill, `Drop a pin and Investigate first before attempting to ${skill}.`);
    }

    const target = this.pois.find(
      (p) => p.state === "discovered" && angleBetweenDeg(pinDir, p.dir) <= MID_DEG
    );

    if (!target) {
      return this._autofail(skill, `No discovered target at your pinned spot. Drop a pin and Investigate to uncover a target first.`);
    }
    if (target.actionResolved) {
      return this._autofail(skill, `${target.label} has already been resolved. Repeated attempts autofail.`);
    }

    const modifier = this._getModifier(character, skill);
    const roll = this._rollD20("normal");
    const total = roll.chosen + modifier;
    const critSuccess = roll.chosen === 20;
    const critFail = roll.chosen === 1;
    const success = critSuccess || (!critFail && total >= target.dc);

    target.actionResolved = true;

    let acquiredItem = null;
    if (success) {
      this.vitals.wonlongs += critSuccess ? 300 : 150;
      acquiredItem = this._claimLoot(target.actionLoot);
    } else {
      this.vitals.stress = Math.min(this.vitals.maxStress, this.vitals.stress + (critFail ? 2 : 1));
      if (skill === "Attack" || critFail) {
        this.vitals.hp = Math.max(1, this.vitals.hp - (critFail ? 6 : 3));
      }
    }

    return {
      skill,
      label: target.label,
      dc: target.dc,
      rollMode: "normal",
      rolls: roll.rolls,
      d20: roll.chosen,
      modifier,
      total,
      success,
      critSuccess,
      critFail,
      autofail: false,
      poi: target,
      acquiredItem,
      narrative: success ? target.actionSuccess : target.actionFail,
      cacheIntent: success ? "success" : "failure",
      vitals: { ...this.vitals },
    };
  }

  _autofail(skill, narrative) {
    return {
      skill,
      label: "Locked / Out of Range",
      dc: 0,
      rollMode: "autofail",
      rolls: [],
      d20: 0,
      modifier: 0,
      total: 0,
      success: false,
      critSuccess: false,
      critFail: false,
      autofail: true,
      acquiredItem: null,
      narrative,
      cacheIntent: "failure",
      vitals: { ...this.vitals },
    };
  }
}
