// © 2026 Adobe. MIT License. See /LICENSE for details.
// Copies sibling package source into references/ for the published tarball.
// Run from packages/data (prepublishOnly). No-op if sibling packages are missing.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..");
const refsDir = path.join(packageRoot, "references");

const PACKAGES = [
  "data-lit",
  "data-react",
  "data-react-hello",
  "data-react-pixie",
  "data-lit-todo",
];

const COPY_ENTRIES = ["src", "package.json", "tsconfig.json", "README.md"];

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      copyRecursive(path.join(src, name), path.join(dest, name));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

if (fs.existsSync(refsDir)) {
  fs.rmSync(refsDir, { recursive: true });
}
fs.mkdirSync(refsDir, { recursive: true });

for (const name of PACKAGES) {
  const srcRoot = path.join(packageRoot, "..", name);
  if (!fs.existsSync(srcRoot)) continue;

  const destRoot = path.join(refsDir, name);
  fs.mkdirSync(destRoot, { recursive: true });

  for (const entry of COPY_ENTRIES) {
    const srcPath = path.join(srcRoot, entry);
    if (!fs.existsSync(srcPath)) continue;
    const destPath = path.join(destRoot, entry);
    copyRecursive(srcPath, destPath);
  }
}
