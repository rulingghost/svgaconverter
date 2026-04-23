const fileInput = document.getElementById("fileInput");
const dropZone = document.getElementById("dropZone");
const fileNameEl = document.getElementById("fileName");
const convertBtn = document.getElementById("convertBtn");
const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");

/** @type {File | null} */
let selected = null;

function setError(msg) {
  if (!msg) {
    errorEl.hidden = true;
    errorEl.textContent = "";
    return;
  }
  errorEl.hidden = false;
  errorEl.textContent = msg;
}

function setStatus(msg) {
  statusEl.textContent = msg || "";
}

function pickFile(file) {
  selected = file || null;
  setError("");
  if (!selected) {
    fileNameEl.textContent = "Henüz dosya yok";
    convertBtn.disabled = true;
    return;
  }
  fileNameEl.textContent = selected.name;
  convertBtn.disabled = false;
}

dropZone.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  const f = fileInput.files && fileInput.files[0];
  pickFile(f || null);
});

["dragenter", "dragover"].forEach((ev) => {
  dropZone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  });
});

["dragleave", "drop"].forEach((ev) => {
  dropZone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
  });
});

dropZone.addEventListener("drop", (e) => {
  const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  pickFile(f || null);
});

convertBtn.addEventListener("click", async () => {
  if (!selected) {
    return;
  }
  setError("");
  convertBtn.disabled = true;
  setStatus("Dönüştürülüyor…");

  const body = new FormData();
  body.append("file", selected, selected.name);

  try {
    const res = await fetch("/api/convert", {
      method: "POST",
      body,
    });

    const ct = res.headers.get("content-type") || "";

    if (!res.ok) {
      if (ct.includes("application/json")) {
        const j = await res.json();
        throw new Error(j.error || "İstek başarısız.");
      }
      throw new Error(`Sunucu hatası (${res.status}).`);
    }

    const blob = await res.blob();
    const dispo = res.headers.get("content-disposition") || "";
    let outName = selected.name.replace(/\.[^.]+$/, "") + ".svga";
    const m = /filename\*=UTF-8''([^;]+)|filename="([^"]+)"/i.exec(dispo);
    if (m) {
      outName = decodeURIComponent(m[1] || m[2] || outName);
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = outName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    setStatus("İndirme başladı.");
  } catch (err) {
    setError(err.message || "Bilinmeyen hata.");
    setStatus("");
  } finally {
    convertBtn.disabled = !selected;
  }
});
