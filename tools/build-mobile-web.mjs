import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const out = path.join(root, "www");

const files = [
  "index.html",
  "styles.css",
  "app.js",
  "memory-core.js",
  "time-core.js",
  "ocr-engine.js",
  "native-bridge.js",
  "manifest.webmanifest",
  "service-worker.js",
];

async function copyFile(source, target) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

async function copyDir(source, target, filter = () => true) {
  await fs.mkdir(target, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (!filter(from, entry)) continue;
    if (entry.isDirectory()) {
      await copyDir(from, to, filter);
    } else if (entry.isFile()) {
      await copyFile(from, to);
    }
  }
}

await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(out, { recursive: true });

for (const file of files) {
  await copyFile(path.join(root, file), path.join(out, file));
}

await copyDir(path.join(root, "icons"), path.join(out, "icons"));
// Rebuild language assets from the dependencies already pinned in package-lock.json.
// Tesseract OEM 1 uses the integerized LSTM data.
for (const language of ["eng", "chi_tra"]) {
  await copyFile(
    path.join(root, "node_modules", "@tesseract.js-data", language, "4.0.0_best_int", `${language}.traineddata.gz`),
    path.join(out, "ocr-data", `${language}.traineddata.gz`)
  );
}

try {
  await copyDir(path.join(root, "focus-oyl"), path.join(out, "focus-oyl"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

await copyDir(
  path.join(root, "node_modules", "tesseract.js", "dist"),
  path.join(out, "node_modules", "tesseract.js", "dist"),
  (_from, entry) => entry.isDirectory() || /^(tesseract|worker)\.min\.js$/.test(entry.name)
);

await copyDir(
  path.join(root, "node_modules", "tesseract.js-core"),
  path.join(out, "node_modules", "tesseract.js-core"),
  (_from, entry) => entry.isDirectory() || /^tesseract-core.*\.(js|wasm)$/.test(entry.name)
);

const stat = await fs.stat(out);
console.log(`Built mobile web assets at ${path.relative(root, out)} (${stat.isDirectory() ? "ready" : "missing"})`);
