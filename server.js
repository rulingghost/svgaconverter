const fs = require("fs");
const os = require("os");
const path = require("path");
const express = require("express");
const multer = require("multer");

const { snapSvgaFps } = require("./lib/svga-common");
const { createSvga2FromPngDir } = require("./lib/svga2-pack");
const { getVideoMeta, exportPngSequence } = require("./lib/video-frames");
const { isProbablyLottieJson, renderLottieToPngDir } = require("./lib/lottie-render");

const app = express();
const PORT = Number(process.env.PORT) || 3847;
const MAX_MB = Number(process.env.MAX_UPLOAD_MB) || 80;

const VIDEO_EXT = new Set([".mp4", ".webm", ".mov", ".mkv", ".avi", ".m4v"]);
const GIF_EXT = new Set([".gif"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MB * 1024 * 1024 },
});

function safeBaseName(original) {
  const base = path.basename(original || "dosya").replace(/[^\w.\-ğüşıöçĞÜŞİÖÇ]+/g, "_");
  return base.slice(0, 120) || "dosya";
}

function extensionLower(name) {
  return path.extname(name || "").toLowerCase();
}

app.use(express.static(path.join(__dirname, "public")));

app.post("/api/convert", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "Dosya yüklenmedi." });
    return;
  }

  const ext = extensionLower(req.file.originalname);
  const base = safeBaseName(req.file.originalname);
  const baseNoExt = base.replace(/\.[^.]+$/, "") || "cikti";

  const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), "svga-web-"));
  const frameDir = path.join(workRoot, "frames");
  let inputPath = null;

  try {
    let meta = { width: null, height: null, fps: null };

    if (ext === ".json") {
      let data;
      try {
        data = JSON.parse(req.file.buffer.toString("utf-8"));
      } catch {
        res.status(400).json({ error: "Geçersiz JSON dosyası." });
        return;
      }
      if (!isProbablyLottieJson(data)) {
        res.status(400).json({
          error:
            "Bu JSON Lottie animasyonu gibi görünmüyor (layers / v alanları beklenir). Yalnızca Lottie bodymovin JSON desteklenir.",
        });
        return;
      }
      const jsonStr = req.file.buffer.toString("utf-8");
      const lottieMeta = await renderLottieToPngDir(jsonStr, frameDir);
      meta = {
        width: lottieMeta.width,
        height: lottieMeta.height,
        fps: snapSvgaFps(lottieMeta.fps),
        durationSec: null,
      };
    } else if (VIDEO_EXT.has(ext) || GIF_EXT.has(ext)) {
      inputPath = path.join(workRoot, `girdi${ext}`);
      fs.writeFileSync(inputPath, req.file.buffer);
      const v = await getVideoMeta(inputPath);
      meta = {
        width: v.width,
        height: v.height,
        fps: v.fps,
        durationSec: v.durationSec,
      };
      await exportPngSequence({
        inputPath,
        outputDir: frameDir,
        width: v.width,
        height: v.height,
      });
    } else {
      res.status(400).json({
        error: `Desteklenmeyen uzantı: ${ext || "(yok)"}. mp4, webm, mov, mkv, gif veya Lottie JSON kullanın.`,
      });
      return;
    }

    const outName = `${baseNoExt}.svga`;
    const outPath = path.join(workRoot, outName);
    await createSvga2FromPngDir({
      inputDir: frameDir,
      outputFile: outPath,
      fps: meta.fps,
      width: meta.width,
      height: meta.height,
      dedupe: true,
      sourceDurationSec: meta.durationSec,
    });

    const svgaBuffer = fs.readFileSync(outPath);
    const asciiFallback = outName.replace(/[^\x20-\x7E]/g, "_") || "cikti.svga";
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(outName)}`
    );
    res.send(svgaBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: err.message || "Dönüştürme başarısız.",
    });
  } finally {
    try {
      fs.rmSync(workRoot, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`SVGA dönüştürücü: http://localhost:${PORT}`);
  });
}

module.exports = app;
