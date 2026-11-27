// elevenLabsClient.js — Cache-First Audio Engine, Safe Cache-Only Mode & Cloudflare Proxy
const DEFAULT_MANIFEST_URL =
  "https://raw.githubusercontent.com/WarrenRe/carbasset/main/assets/audio/audio-manifest.json";
const DEFAULT_PROXY_URL = "https://carbon-2185-tts-proxy.warrencreid.workers.dev";
const MAX_CHARS_PER_CLIP = 220;

function toSlug(text) {
  return String(text || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function normalizeText(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

export class ElevenLabsClient {
  constructor(options = {}) {
    this.manifestUrl = options.manifestUrl || DEFAULT_MANIFEST_URL;
    this.proxyUrl = options.proxyUrl || DEFAULT_PROXY_URL;
    this.onStatus = options.onStatus || (() => {});
    this.onArchiveLog = options.onArchiveLog || (() => {});
    this.onQuotaUpdate = options.onQuotaUpdate || (() => {});

    this.manifest = null;
    this.clips = [];
    this.archiveLog = [];
    this.currentAudio = null;
    this.abortController = null;
    this.quota = { usedChars: 0, dailyLimit: 2500, remainingChars: 2500 };
  }

  async init(forceRefresh = false) {
    if (this.manifest && !forceRefresh) return this.manifest;
    const bust = forceRefresh ? `?t=${Date.now()}` : "";
    const res = await fetch(`${this.manifestUrl}${bust}`);
    if (!res.ok) throw new Error(`Failed to load audio-manifest.json (HTTP ${res.status})`);
    this.manifest = await res.json();
    this.clips = this.manifest.clips || [];
    return this.manifest;
  }

  async fetchQuotaStatus() {
    try {
      const res = await fetch(this.proxyUrl, { method: "GET" });
      if (!res.ok) return this.quota;
      const data = await res.json();
      this.quota = {
        usedChars: data.usedChars ?? 0,
        dailyLimit: data.dailyLimit ?? 2500,
        remainingChars: data.remainingChars ?? 0,
      };
      this.onQuotaUpdate(this.quota);
      return this.quota;
    } catch {
      return this.quota;
    }
  }

  stop() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.src = "";
      this.currentAudio = null;
    }
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }

  findCachedClip({ text = "", speaker = "", role = "Narrator", intent = "" }) {
    const normText = normalizeText(text);
    const spkSlug = toSlug(speaker);
    const normIntent = String(intent || "").toLowerCase();

    if (normText) {
      const exactText = this.clips.find(
        (c) => normalizeText(c.text) === normText && (!role || c.role === role)
      );
      if (exactText) return exactText;
    }

    if (normIntent) {
      if (spkSlug) {
        const bySpk = this.clips.find(
          (c) => toSlug(c.speaker) === spkSlug && String(c.intent || "").toLowerCase().includes(normIntent)
        );
        if (bySpk) return bySpk;
      }
      const byRole = this.clips.find(
        (c) => c.role === role && String(c.intent || "").toLowerCase().includes(normIntent)
      );
      if (byRole) return byRole;
    }
    return null;
  }

  findFallbackClip({ speaker = "", role = "Narrator", intent = "" }) {
    const spkSlug = toSlug(speaker);
    return (
      this.clips.find((c) => toSlug(c.speaker) === spkSlug && c.intent === "fallback_generic") ||
      this.clips.find((c) => c.role === role && c.intent === "fallback_generic") ||
      this.clips.find((c) => c.role === role && c.intent === intent) ||
      this.clips.find((c) => c.id === "nar-fallback-generic") ||
      this.clips[0] ||
      null
    );
  }

  async speak(text, options = {}) {
    await this.init();
    this.stop();

    const role = options.role || "Narrator";
    const speaker = options.speaker || (role === "Narrator" ? "narrator" : `${role.toLowerCase()}-generic`);
    const intent = options.intent || "";
    const cacheOnly = Boolean(options.cacheOnly);
    const simulateQuotaExceeded = Boolean(options.simulateQuotaExceeded);

    let cleanText = String(text || "").trim();
    if (cleanText.length > MAX_CHARS_PER_CLIP) {
      cleanText = cleanText.slice(0, MAX_CHARS_PER_CLIP).replace(/\s+\S*$/, "") + ".";
    }

    const startTime = performance.now();

    // 1. CACHE-FIRST CHECK (0 API calls)
    const cached = this.findCachedClip({ text: cleanText, speaker, role, intent });
    if (cached && !options.forceLive) {
      this.onStatus(`CACHE HIT (0 API calls) — Playing ${cached.file}`);
      await this._playUrl(cached.url);
      return { engine: "github-cache", cached: true, clip: cached, latencyMs: Math.round(performance.now() - startTime) };
    }

    // 2. CACHE-ONLY MODE OR EMPTY TEXT: Never hit Cloudflare proxy (prevents HTTP 400 EMPTY_TEXT)
    if (cacheOnly || !cleanText) {
      return this._playCachedFallback({ speaker, role, intent, reason: "Cached audio mode", text: cleanText });
    }

    if (simulateQuotaExceeded || !navigator.onLine) {
      return this._playCachedFallback({
        speaker, role, intent,
        reason: simulateQuotaExceeded ? "Daily quota test" : "Offline",
        text: cleanText,
      });
    }

    // 3. LIVE STREAM VIA CLOUDFLARE PROXY
    this.abortController = new AbortController();
    try {
      this.onStatus(`Cache miss — Streaming ${role} via Cloudflare proxy...`);
      const response = await fetch(this.proxyUrl, {
        method: "POST",
        signal: this.abortController.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: cleanText, role, voiceId: options.voiceId || undefined }),
      });

      this._syncQuotaHeaders(response.headers);
      if (response.status === 429) {
        return this._playCachedFallback({ speaker, role, intent, reason: "Daily quota exceeded", text: cleanText });
      }
      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        throw new Error(`Proxy HTTP ${response.status} ${errText.slice(0, 120)}`);
      }

      const audioBlob = await response.blob();
      const blobUrl = URL.createObjectURL(audioBlob);
      const archiveEntry = this._recordArchiveEntry({ text: cleanText, speaker, role, intent: intent || "dynamic", blob: audioBlob, blobUrl });

      await this._playUrl(blobUrl);
      const latencyMs = Math.round(performance.now() - startTime);
      this.onStatus(`LIVE STREAM (${role}) — ${latencyMs}ms | Remaining: ${this.quota.remainingChars} chars`);
      return { engine: "cloudflare-elevenlabs-proxy", cached: false, archiveEntry, latencyMs };
    } catch (err) {
      if (err.name === "AbortError") return { engine: "aborted", latencyMs: 0 };
      return this._playCachedFallback({ speaker, role, intent, reason: err.message, text: cleanText });
    }
  }

  async _playCachedFallback({ speaker, role, intent, reason, text }) {
    const fallbackClip = this.findFallbackClip({ speaker, role, intent });
    if (fallbackClip) {
      this.onStatus(`CACHED AUDIO (${reason}) — ${fallbackClip.file}`);
      try {
        await this._playUrl(fallbackClip.url);
        return { engine: "cached-fallback", clip: fallbackClip, reason };
      } catch (e) {
        console.warn("Cached MP3 playback failed:", e.message);
      }
    }
    if ("speechSynthesis" in window && text) {
      this.onStatus(`WEB SPEECH BACKUP (${reason})`);
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
      return { engine: "webspeech-backup", reason };
    }
    this.onStatus(`TEXT-ONLY (${reason})`);
    return { engine: "text-only", reason };
  }

  _playUrl(url) {
    return new Promise((resolve, reject) => {
      const audio = new Audio(url);
      this.currentAudio = audio;
      audio.onplaying = () => resolve();
      audio.onerror = () => reject(new Error(`Audio playback error for ${url}`));
      audio.play().catch(reject);
    });
  }

  _syncQuotaHeaders(headers) {
    const used = parseInt(headers.get("X-Quota-Used"), 10);
    const limit = parseInt(headers.get("X-Quota-Limit"), 10);
    const remaining = parseInt(headers.get("X-Quota-Remaining"), 10);
    if (!Number.isNaN(used) && !Number.isNaN(limit)) {
      this.quota = { usedChars: used, dailyLimit: limit, remainingChars: Number.isNaN(remaining) ? Math.max(0, limit - used) : remaining };
      this.onQuotaUpdate(this.quota);
    }
  }

  _recordArchiveEntry({ text, speaker, role, intent, blob, blobUrl }) {
    const spkSlug = toSlug(speaker) || "narrator";
    const textSlug = toSlug(text.split(/\s+/).slice(0, 4).join("-")) || "line";
    const isNarrator = spkSlug === "narrator";
    const folder = isNarrator ? "narrator" : `characters/${spkSlug}`;
    const filename = isNarrator ? `nar-${textSlug}.mp3` : `${spkSlug}-${textSlug}.mp3`;
    const relPath = `${folder}/${filename}`;
    const baseUrl = this.manifest?.meta?.base_url || "https://raw.githubusercontent.com/WarrenRe/carbasset/main/assets/audio/";
    const entry = {
      filename, folder: `assets/audio/${folder}/`, text, role, speaker: spkSlug, blob, blobUrl,
      manifestSnippet: { id: filename.replace(/\.mp3$/, ""), speaker: spkSlug, role, intent, text, file: relPath, url: `${baseUrl}${relPath}` },
      createdAt: new Date().toLocaleTimeString(),
    };
    this.archiveLog.unshift(entry);
    this.onArchiveLog(entry, this.archiveLog);
    return entry;
  }
}
