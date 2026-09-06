/* Focus Oyl local OCR engine
   Browser-only OCR adapter backed by local Tesseract.js + local language data. */

(() => {
  const OCR_LANGS = "eng+chi_tra";
  const OCR_OPTIONS = {
    workerPath: "/node_modules/tesseract.js/dist/worker.min.js",
    corePath: "/node_modules/tesseract.js-core",
    langPath: "/ocr-data",
    gzip: true,
  };

  let workerPromise = null;
  const listeners = new Set();

  function isImageFile(file) {
    if (!file) return false;
    return /^image\//i.test(file.type || "") || /\.(png|jpe?g|webp|bmp|tiff?)$/i.test(file.name || "");
  }

  function onProgress(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function emitProgress(message) {
    listeners.forEach((listener) => listener(message));
  }

  async function getWorker() {
    if (!window.Tesseract?.createWorker) {
      throw new Error("Local OCR engine is not loaded.");
    }

    if (!workerPromise) {
      workerPromise = window.Tesseract.createWorker(OCR_LANGS, 1, {
        ...OCR_OPTIONS,
        logger: emitProgress,
      });
    }

    return workerPromise;
  }

  async function recognize(file) {
    if (!isImageFile(file)) {
      throw new Error("Unsupported OCR input.");
    }

    const worker = await getWorker();
    const response = await worker.recognize(file);
    const text = String(response?.data?.text || "")
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return {
      text,
      confidence: Math.round(response?.data?.confidence || 0),
    };
  }

  window.UltraOCR = {
    isImageFile,
    onProgress,
    recognize,
  };
})();
