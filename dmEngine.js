// dmEngine.js — Task 4.5: Carbon 2185 d20 Skill-Check Engine & Cache-First GM Narrator
export class DMEngine {
  constructor() {
    this.vitals = { hp: 16, maxHp: 16, stress: 0, maxStress: 10, wonlongs: 750, profBonus: 2 };
  }

  initCharacterVitals(character, level = 1) {
    const lvl = Math.max(1, Math.min(20, Number(level) || 1));
    const maxHp = 10 + lvl * 6;
    const profBonus = Math.floor((lvl - 1) / 4) + 2;
    this.vitals = {
      hp: maxHp,
      maxHp,
      stress: 0,
      maxStress: 10,
      wonlongs: 500 + lvl * 250,
      profBonus,
    };
    return this.vitals;
  }

  /**
   * Returns location.hotspots if defined in carbon2185-db.json,
   * otherwise generates 3 interactive Carbon 2185 hotspots around the 360° scene.
   */
  getHotspotsForLocation(location) {
    if (Array.isArray(location?.hotspots) && location.hotspots.length) {
      return location.hotspots;
    }
    const locName = location?.name || "Sector";
    return [
      {
        id: "hs-terminal",
        label: "Encrypted Access Terminal",
        skill: "Hack",
        dc: 13,
        yaw: -35,
        pitch: -4,
        color: "#00f0ff",
        successLine: `Firewall cracked in ${locName}. You siphon corporate telemetry before the trace locks on.`,
        failLine: `Black ICE spikes your neural link. Security drones are rerouting to ${locName}.`,
      },
      {
        id: "hs-clue",
        label: "Scan Perimeter & Sightlines",
        skill: "Investigation",
        dc: 12,
        yaw: 32,
        pitch: 2,
        color: "#fbbf24",
        successLine: `Your optics flag a hidden drop-cache and a blind spot past the surveillance grid.`,
        failLine: `Static blurs your visor feed. You miss the tripwire hum beneath the neon glare.`,
      },
      {
        id: "hs-threat",
        label: "Check Hostile Movement",
        skill: "Attack",
        dc: 14,
        yaw: 115,
        pitch: -6,
        color: "#ff2a85",
        successLine: `Clean strike through the shadows. Target neutralized before they can ping backup.`,
        failLine: `The shot clips reinforced plating. Brace yourself—hostiles have your position locked.`,
      },
    ];
  }

  resolveCheck({ label, skill = "Investigation", dc = 12, character, level = 1, successLine, failLine }) {
    const d20 = Math.floor(Math.random() * 20) + 1;
    const prof = this.vitals.profBonus;
    const skillsText = String(character?.skills || character?.skill_proficiencies || "").toLowerCase();
    const isProficient = skillsText.includes(skill.toLowerCase());
    const modifier = (isProficient ? prof : Math.floor(prof / 2)) + 2;
    const total = d20 + modifier;

    const critSuccess = d20 === 20;
    const critFail = d20 === 1;
    const success = critSuccess || (!critFail && total >= dc);

    // Update vitals based on outcome
    if (success) {
      this.vitals.wonlongs += critSuccess ? 250 : 100;
    } else {
      this.vitals.stress = Math.min(this.vitals.maxStress, this.vitals.stress + (critFail ? 2 : 1));
      if (skill === "Attack" || critFail) {
        this.vitals.hp = Math.max(1, this.vitals.hp - (critFail ? 6 : 3));
      }
    }

    const defaultSuccess =
      successLine || `${label}: ${skill} check succeeded. You stay two steps ahead of the street.`;
    const defaultFail =
      failLine || `${label}: ${skill} check failed. Complications spike across your HUD.`;

    const narrative = critSuccess
      ? `Critical hit. ${defaultSuccess}`
      : critFail
      ? `Critical glitch. ${defaultFail}`
      : success
      ? defaultSuccess
      : defaultFail;

    return {
      label,
      skill,
      dc,
      d20,
      modifier,
      total,
      success,
      critSuccess,
      critFail,
      narrative,
      // Maps to cached starter clips in audio-manifest.json when in cache-first mode
      cacheIntent: success ? "success" : "failure",
      vitals: { ...this.vitals },
    };
  }
}
