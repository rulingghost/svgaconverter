/**
 * SVGA 2.x: zlib sıkıştırılmış protobuf (ör. angel.svga — ZIP değil, başlangıç 78 9c)
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { ProtoMovieEntity } = require("./svga-proto");
const { collectPngAnimation } = require("./svga-common");

function imageKeyForIndex(index) {
  return `img_${String(index + 1).padStart(4, "0")}`;
}

function buildSpritesForProto(uniqueFrames, frameCount, width, height) {
  const layout = { x: 0, y: 0, width, height };
  const transform = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };

  return uniqueFrames.map((uf, index) => ({
    imageKey: imageKeyForIndex(index),
    frames: Array.from({ length: frameCount }, (_, frameIndex) => ({
      alpha: uf.activeFrames.has(frameIndex) ? 1 : 0,
      layout,
      transform,
      clipPath: "",
      shapes: [],
    })),
  }));
}

async function createSvga2FromPngDir({
  inputDir,
  outputFile,
  fps: fpsInput,
  width: widthHint,
  height: heightHint,
  dedupe = true,
  sourceDurationSec = null,
}) {
  const job = collectPngAnimation(inputDir, dedupe, fpsInput, sourceDurationSec, widthHint, heightHint);

  const images = {};
  job.uniqueFrames.forEach((uf, index) => {
    images[imageKeyForIndex(index)] = fs.readFileSync(uf.source);
  });

  const payload = {
    version: "2.0.0",
    params: {
      viewBoxWidth: job.finalWidth,
      viewBoxHeight: job.finalHeight,
      fps: job.fps,
      frames: job.frameCount,
    },
    images,
    sprites: buildSpritesForProto(job.uniqueFrames, job.frameCount, job.finalWidth, job.finalHeight),
  };

  const err = ProtoMovieEntity.verify(payload);
  if (err) {
    throw new Error(`SVGA protobuf doğrulama: ${err}`);
  }

  const message = ProtoMovieEntity.create(payload);
  const encoded = ProtoMovieEntity.encode(message).finish();
  const deflated = zlib.deflateSync(Buffer.from(encoded), { level: 9 });

  const dir = path.dirname(outputFile);
  if (dir && dir !== ".") {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (fs.existsSync(outputFile)) {
    fs.unlinkSync(outputFile);
  }
  fs.writeFileSync(outputFile, deflated);

  return {
    frameCount: job.frameCount,
    uniqueImages: job.uniqueFrames.length,
    width: job.finalWidth,
    height: job.finalHeight,
    fps: job.fps,
  };
}

module.exports = { createSvga2FromPngDir };
