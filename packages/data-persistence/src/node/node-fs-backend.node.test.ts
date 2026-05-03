// © 2026 Adobe. MIT License. See /LICENSE for details.
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPersistenceBackendConformance } from "../backend/persistence-backend.conformance.js";
import { createNodeFsBackend } from "./node-fs-backend.js";

runPersistenceBackendConformance("node-fs", async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), "data-persistence-be-"));
    const backend = await createNodeFsBackend(dir);
    return {
        backend,
        cleanup: async () => {
            await fs.rm(dir, { recursive: true, force: true });
        },
    };
});
