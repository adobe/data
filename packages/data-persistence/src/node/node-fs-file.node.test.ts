// © 2026 Adobe. MIT License. See /LICENSE for details.
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runRandomAccessFileConformance } from "../backend/random-access-file.conformance.js";
import { createNodeFsFile } from "./node-fs-file.js";

let counter = 0;
runRandomAccessFileConformance("node-fs", async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), "data-persistence-raf-"));
    const path = join(dir, `file-${counter++}.bin`);
    return createNodeFsFile(path);
});
