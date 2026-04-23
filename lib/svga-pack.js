const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const archiver = require("archiver");

function fail(message) {
  throw new Error(message);
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

function buildMovieSpec({ width, height, fps, frameCount, spriteFrames }) {
  const sprites = spriteFrames.map((activeFrames, index) => ({
    imageKey: `img_${String(index + 1).padStart(4, "0")}`,
    frames: Array.from({ length: frameCount }, (_, frameIndex) => ({
      alpha: activeFrames.has(frameIndex) ? 1 : 0,
      layout: { x: 0, y: 0, width, height },
      transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
    })),
  }));

  const images = Object.fromEntries(sprites.map((sprite) => [sprite.imageKey, sprite.imageKey]));

  return {
    movie: {
      viewBox: { width, height },
      fps,
      frames: frameCount,
    },
    images,
    sprites,
  };
}

function zipDirectoryToFile(sourceDir, outputFile) {
  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(outputFile);
    const archive = archiver("zip", { zlib: { level: 9 } });

    stream.on("close", () => resolve());
    stream.on("error", reject);
    archive.on("error", reject);
    archive.pipe(stream);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

async function createSvgaFromPngDir({ inputDir, outputFile, fps, width, height, dedupe = true }) {
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

  const detectedSize = readPngSize(path.join(inputDir, pngFiles[0]));
  const finalWidth = width || detectedSize.width;
  const finalHeight = height || detectedSize.height;
  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), "svga-build-"));

  try {
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

    const movieSpec = buildMovieSpec({
      width: finalWidth,
      height: finalHeight,
      fps,
      frameCount: pngFiles.length,
      spriteFrames: uniqueFrames.map((frame) => frame.activeFrames),
    });

    fs.writeFileSync(path.join(stagingDir, "movie.spec"), JSON.stringify(movieSpec));
    uniqueFrames.forEach((frame, index) => {
      const imageKey = `img_${String(index + 1).padStart(4, "0")}`;
      fs.copyFileSync(frame.source, path.join(stagingDir, `${imageKey}.png`));
    });

    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    if (fs.existsSync(outputFile)) {
      fs.unlinkSync(outputFile);
    }

    await zipDirectoryToFile(stagingDir, outputFile);

    return {
      frameCount: pngFiles.length,
      uniqueImages: uniqueFrames.length,
      width: finalWidth,
      height: finalHeight,
      fps,
    };
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}

module.exports = { createSvgaFromPngDir };
