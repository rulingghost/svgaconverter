const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");

function setBinaryPaths() {
  let ffmpegPath;
  let ffprobePath;
  try {
    ffmpegPath = require("ffmpeg-static");
  } catch {
    ffmpegPath = null;
  }
  try {
    ffprobePath = require("ffprobe-static").path;
  } catch {
    ffprobePath = null;
  }
  if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
  }
  if (ffprobePath) {
    ffmpeg.setFfprobePath(ffprobePath);
  }
}

setBinaryPaths();

function ffprobeAsync(inputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, data) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(data);
    });
  });
}

async function getVideoMeta(inputPath) {
  const parsed = await ffprobeAsync(inputPath);
  const videoStream = parsed.streams.find((s) => s.codec_type === "video");
  if (!videoStream) {
    throw new Error("Dosyada video akışı yok.");
  }
  const fpsParts = String(videoStream.avg_frame_rate || videoStream.r_frame_rate || "0/1").split("/");
  const fps = Number(fpsParts[0]) / Number(fpsParts[1] || 1);
  const frames = Number(videoStream.nb_frames || 0);
  const hasAlpha = String(videoStream.pix_fmt || "").includes("a");

  return {
    width: Number(videoStream.width),
    height: Number(videoStream.height),
    fps: Number.isFinite(fps) && fps > 0 ? Math.round(fps * 1000) / 1000 : 30,
    frames,
    hasAlpha,
  };
}

function exportPngSequence({ inputPath, outputDir, width, height }) {
  fs.mkdirSync(outputDir, { recursive: true });
  const pattern = path.join(outputDir, "frame_%04d.png");

  return new Promise((resolve, reject) => {
    let cmd = ffmpeg(inputPath).outputOptions(["-map", "0:v:0", "-fps_mode", "passthrough"]).output(pattern);

    if (width && height) {
      cmd = cmd.videoFilters(`scale=${width}:${height}:flags=lanczos`);
    }

    cmd.on("end", resolve).on("error", reject).run();
  });
}

module.exports = {
  getVideoMeta,
  exportPngSequence,
  setBinaryPaths,
};
