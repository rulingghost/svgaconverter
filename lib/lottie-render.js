const fs = require("fs");
const path = require("path");

function isProbablyLottieJson(obj) {
  if (!obj || typeof obj !== "object") {
    return false;
  }
  if (!Array.isArray(obj.layers)) {
    return false;
  }
  return typeof obj.v === "string" || typeof obj.fr === "number";
}

async function renderLottieToPngDir(jsonString, outputDir) {
  const { createCanvas, LottieAnimation } = await import("@napi-rs/canvas");

  const animation = LottieAnimation.loadFromData(jsonString);
  const w = Math.max(1, Math.round(animation.width));
  const h = Math.max(1, Math.round(animation.height));
  const fps = Math.max(1, Number(animation.fps) || 30);
  const totalFrames = Math.max(1, Math.round(Number(animation.frames)));

  fs.mkdirSync(outputDir, { recursive: true });

  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");

  for (let i = 0; i < totalFrames; i += 1) {
    animation.seekFrame(i);
    ctx.clearRect(0, 0, w, h);
    animation.render(ctx, { x: 0, y: 0, width: w, height: h });
    const out = path.join(outputDir, `frame_${String(i + 1).padStart(4, "0")}.png`);
    fs.writeFileSync(out, canvas.toBuffer("image/png"));
  }

  return { width: w, height: h, fps, frames: totalFrames };
}

module.exports = {
  isProbablyLottieJson,
  renderLottieToPngDir,
};
