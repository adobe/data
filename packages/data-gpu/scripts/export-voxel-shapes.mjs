#!/usr/bin/env node
// © 2026 Adobe. MIT License. See /LICENSE for details.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { definitions } from "../dist/voxel-shape/voxel-shape-definitions.js";
import { serializeVoxelShapeFile } from "../dist/voxel-shape/voxel-shape-file.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = process.argv[2]
    ? resolve(process.argv[2])
    : join(repoRoot, "../../../mechs/shapes");

mkdirSync(outDir, { recursive: true });

for (const name of Object.keys(definitions)) {
    const file = serializeVoxelShapeFile(definitions[name]());
    const path = join(outDir, `${name}.json`);
    writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);
    console.log(`wrote ${path}`);
}
