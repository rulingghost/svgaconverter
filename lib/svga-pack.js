const fs = require("fs");
const os = require("os");
const path = require("path");
const archiver = require("archiver");
const { collectPngAnimation, fail, snapSvgaFps, LEGAL_FPS } = require("./svga-common");

function buildMovieSpec({ width, height, fps, frameCount, spriteFrames }) {
  const sprites = spriteFrames.map((activeFrames, index) => ({
    imageKey: `img_${String(index + 1).padStart(4, "0")}`,
    frames: Array.from({ length: frameCount }, (_, frameIndex) => ({
      alpha: activeFrames.has(frameIndex) ? 1.0 : 0.0,
      layout: { x: 0.0, y: 0.0, width, height },
      transform: { a: 1.0, b: 0.0, c: 0.0, d: 1.0, tx: 0.0, ty: 0.0 },
      clipPath: "",
      shapes: [],
    })),
  }));

  const images = Object.fromEntries(sprites.map((sprite) => [sprite.imageKey, sprite.imageKey]));

  return {
    ver: "1.1.0",
    movie: {
      viewBox: { width, height },
      fps,
      frames: frameCount,
    },
    images,
    sprites,
  };
}

function zipStagingFlat(stagingDir, outputFile) {
  const names = fs
    .readdirSync(stagingDir)
    .filter((n) => {
      const full = path.join(stagingDir, n);
      return fs.statSync(full).isFile();
    })
    .sort();

  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(outputFile);
    const archive = archiver("zip", { zlib: { level: 9 } });

    stream.on("close", () => resolve());
    stream.on("error", reject);
    archive.on("error", reject);
    archive.pipe(stream);

    for (const name of names) {
      const safeName = path.basename(name).replace(/\\/g, "/");
      if (safeName !== name || name.includes("/") || name.includes("\\")) {
        fail(`Geçersiz arşiv adı: ${name}`);
      }
      archive.file(path.join(stagingDir, name), { name: safeName });
    }

    archive.finalize();
  });
}

/** SVGA 1.x ZIP — eski oynatıcılar için (isteğe bağlı) */
async function createSvgaFromPngDir(options) {
  const job = collectPngAnimation(
    options.inputDir,
    options.dedupe !== false,
    options.fps,
    options.sourceDurationSec ?? null,
    options.width,
    options.height
  );

  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), "svga-build-"));

  try {
    const movieSpec = buildMovieSpec({
      width: job.finalWidth,
      height: job.finalHeight,
      fps: job.fps,
      frameCount: job.frameCount,
      spriteFrames: job.uniqueFrames.map((f) => f.activeFrames),
    });

    fs.writeFileSync(path.join(stagingDir, "movie.spec"), JSON.stringify(movieSpec));
    job.uniqueFrames.forEach((frame, index) => {
      const imageKey = `img_${String(index + 1).padStart(4, "0")}`;
      fs.copyFileSync(frame.source, path.join(stagingDir, `${imageKey}.png`));
    });

    fs.mkdirSync(path.dirname(options.outputFile), { recursive: true });
    if (fs.existsSync(options.outputFile)) {
      fs.unlinkSync(options.outputFile);
    }

    await zipStagingFlat(stagingDir, options.outputFile);

    return {
      frameCount: job.frameCount,
      uniqueImages: job.uniqueFrames.length,
      width: job.finalWidth,
      height: job.finalHeight,
      fps: job.fps,
    };
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}

module.exports = { createSvgaFromPngDir, snapSvgaFps, LEGAL_FPS };
