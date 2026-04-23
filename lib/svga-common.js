const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/** SVGA — movie.fps için izin verilen değerler */
const LEGAL_FPS = [1, 2, 3, 5, 6, 10, 12, 15, 20, 30, 60];

function fail(message) {
  throw new Error(message);
}

function snapSvgaFps(fps) {
  const n = Number(fps);
  if (!Number.isFinite(n) || n <= 0) {
    return 20;
  }
  const r = Math.round(n);
  if (LEGAL_FPS.includes(r)) {
    return r;
  }
  let best = LEGAL_FPS[0];
  let bestDiff = Math.abs(n - best);
  for (const f of LEGAL_FPS) {
    const d = Math.abs(n - f);
    if (d < bestDiff || (d === bestDiff && f > best)) {
      best = f;
      bestDiff = d;
    }
  }
  return best;
}

function bestLegalFpsForDuration(frameCount, durationSec, hintFps) {
  if (frameCount <= 0 || !Number.isFinite(durationSec) || durationSec <= 0) {
    return snapSvgaFps(hintFps);
  }
  let best = LEGAL_FPS[0];
  let bestErr = Infinity;
  const hint = Number(hintFps);
  for (const f of LEGAL_FPS) {
    const err = Math.abs(frameCount / f - durationSec);
    if (err < bestErr || (err === bestErr && Math.abs(f - hint) < Math.abs(best - hint))) {
      best = f;
      bestErr = err;
    }
  }
  return best;
}

function readPngSize(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    fail(`PNG değil: ${filePath}`);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function sha1(buffer) {
  return crypto.createHash("sha1").update(buffer).digest("hex");
}

/**
 * PNG kare dizinini okur; benzersiz bitmap seti ve fps ile birlikte döner.
 * @returns {{ frameCount: number, finalWidth: number, finalHeight: number, fps: number, uniqueFrames: Array<{source: string, activeFrames: Set<number>}> }}
 */
function collectPngAnimation(inputDir, dedupe, fpsInput, sourceDurationSec, widthHint, heightHint) {
  if (!fs.existsSync(inputDir) || !fs.statSync(inputDir).isDirectory()) {
    fail(`Klasör bulunamadı: ${inputDir}`);
  }

  const pngFiles = fs
    .readdirSync(inputDir)
    .filter((name) => name.toLowerCase().endsWith(".png"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (pngFiles.length === 0) {
    fail(`PNG yok: ${inputDir}`);
  }

  const firstSize = readPngSize(path.join(inputDir, pngFiles[0]));
  for (let i = 1; i < pngFiles.length; i += 1) {
    const s = readPngSize(path.join(inputDir, pngFiles[i]));
    if (s.width !== firstSize.width || s.height !== firstSize.height) {
      fail(
        `Tüm kareler aynı boyutta olmalı (${firstSize.width}x${firstSize.height}), farklı: ${pngFiles[i]} (${s.width}x${s.height})`
      );
    }
  }

  const finalWidth = firstSize.width;
  const finalHeight = firstSize.height;

  if (widthHint && heightHint && (widthHint !== finalWidth || heightHint !== finalHeight)) {
    console.warn(
      `[svga] viewBox ipucu (${widthHint}x${heightHint}) PNG ile uyumsuz; gerçek ${finalWidth}x${finalHeight} kullanılıyor.`
    );
  }

  const frameCount = pngFiles.length;
  const fps = bestLegalFpsForDuration(frameCount, sourceDurationSec, fpsInput);

  const uniqueFrames = [];
  const hashToIndex = new Map();

  pngFiles.forEach((fileName, frameIndex) => {
    const source = path.join(inputDir, fileName);
    const buf = fs.readFileSync(source);
    const hash = sha1(buf);
    const existingIndex = dedupe ? hashToIndex.get(hash) : undefined;

    if (existingIndex !== undefined) {
      uniqueFrames[existingIndex].activeFrames.add(frameIndex);
      return;
    }

    const nextIndex = uniqueFrames.length;
    if (dedupe) {
      hashToIndex.set(hash, nextIndex);
    }
    uniqueFrames.push({
      source,
      activeFrames: new Set([frameIndex]),
    });
  });

  return {
    frameCount,
    finalWidth,
    finalHeight,
    fps,
    uniqueFrames,
  };
}

module.exports = {
  LEGAL_FPS,
  snapSvgaFps,
  bestLegalFpsForDuration,
  fail,
  readPngSize,
  collectPngAnimation,
};
