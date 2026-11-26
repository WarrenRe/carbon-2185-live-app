// chromaKey.js — Automatic Green-Screen Detection, Chroma-Key & Green-Despill Helper
const processedCache = new Map();

/**
 * Loads an image URL and automatically keys out green-screen backgrounds
 * if corner pixels are opaque green. Passes true transparent PNGs through untouched.
 * Returns a Data URL (or original URL on CORS/transparent passthrough).
 */
export async function processCutoutImage(url, options = {}) {
  if (!url) return "";
  if (processedCache.has(url)) return processedCache.get(url);

  const tolerance = options.tolerance ?? 42;
  const softness = options.softness ?? 28;

  try {
    const img = await loadCorsImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Sample the 4 corners to check if the image already has transparency or uses a green screen
    const corners = [
      0,
      (canvas.width - 1) * 4,
      (canvas.height - 1) * canvas.width * 4,
      ((canvas.height - 1) * canvas.width + (canvas.width - 1)) * 4,
    ];

    let transparentCorners = 0;
    let greenSamples = [];

    for (const idx of corners) {
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      if (a < 200) {
        transparentCorners++;
      } else if (g > 90 && g > r * 1.25 && g > b * 1.25) {
        greenSamples.push([r, g, b]);
      }
    }

    // Already transparent or not a green-screen background -> return original URL
    if (transparentCorners >= 2 || greenSamples.length < 2) {
      processedCache.set(url, url);
      return url;
    }

    // Average detected green-screen key color from corners
    const keyR = greenSamples.reduce((s, c) => s + c[0], 0) / greenSamples.length;
    const keyG = greenSamples.reduce((s, c) => s + c[1], 0) / greenSamples.length;
    const keyB = greenSamples.reduce((s, c) => s + c[2], 0) / greenSamples.length;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // Euclidean color distance to sampled green background
      const dist = Math.hypot(r - keyR, g - keyG, b - keyB);

      if (dist < tolerance) {
        data[i + 3] = 0;
      } else if (dist < tolerance + softness) {
        const alphaFactor = (dist - tolerance) / softness;
        data[i + 3] = Math.round(data[i + 3] * alphaFactor);
      }

      // Green-despill pass on remaining semi-transparent or edge pixels
      if (data[i + 3] > 0) {
        const maxRB = Math.max(r, b);
        if (g > maxRB) {
          data[i + 1] = Math.round(maxRB + (g - maxRB) * 0.15);
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
    const dataUrl = canvas.toDataURL("image/png");
    processedCache.set(url, dataUrl);
    return dataUrl;
  } catch (err) {
    console.warn("Chroma-key skipped (fallback to original image):", err.message);
    processedCache.set(url, url);
    return url;
  }
}

function loadCorsImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Image load failed: ${url}`));
    img.src = url;
  });
}
