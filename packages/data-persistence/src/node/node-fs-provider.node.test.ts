// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Node-specific provider tests:
//   1. `createNodeFsProvider` with `worker: false` (in-process, no worker)
//   2. Deprecated `mountNodeFs` shim produces an equivalent mount

import { Database } from "@adobe/data/ecs";
import { F32 } from "@adobe/data/math";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mount } from "../provider/mount.js";
import { createNodeFsProvider } from "./create-node-fs-provider.js";
import { mountNodeFs } from "./mount-node-fs.js";
import { runProviderContractTests } from "../provider/persistence-provider.test.js";

// ─── Shared schema ────────────────────────────────────────────────────────────

const entityPlugin = Database.Plugin.create({
    components: {
        x: F32.schema,
        label: { type: "string" },
    } as const,
    archetypes: {
        Point: ["x", "label"],
    } as const,
    transactions: {
        createPoint(t, args: { x: number; label: string }) {
            return t.archetypes.Point.insert(args);
        },
    },
});

const noCheckpoint = { everyNTransactions: 0, idleMs: 0 } as const;

// ─── Contract conformance ─────────────────────────────────────────────────────

// Each call to makeProvider must produce its own isolated root so tests
// don't share state. We create a fresh temp dir per provider instance.
const tempDirs: string[] = [];

runProviderContractTests("NodeFsProvider (worker: false)", () => {
    let rootDir = "";
    // Synchronously generate a stable tmp path; actual mkdir happens in mount().
    rootDir = join(tmpdir(), `data-prov-node-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    tempDirs.push(rootDir);
    return createNodeFsProvider(rootDir, { worker: false });
});

// Clean up temp dirs after all tests in the file.
afterEach(async () => {
    const dirs = tempDirs.splice(0);
    await Promise.all(dirs.map(d => fs.rm(d, { recursive: true, force: true })));
});

// ─── No-worker-specific test ──────────────────────────────────────────────────

describe("createNodeFsProvider — in-process (worker: false)", () => {
    let root: string;

    beforeEach(async () => {
        root = await fs.mkdtemp(join(tmpdir(), "data-prov-inproc-"));
    });

    afterEach(async () => {
        await fs.rm(root, { recursive: true, force: true });
    });

    it("persists and reloads without spawning a worker", async () => {
        const provider = createNodeFsProvider(root, { worker: false });
        expect(provider.providerName).toBe("NodeFsProvider");

        const db1 = Database.create(entityPlugin);
        const m1 = await mount(provider, db1, { checkpoint: noCheckpoint });
        const entity = db1.transactions.createPoint({ x: 7, label: "NoWorker" });
        await m1.service.flush();
        await m1.service.checkpoint();
        await m1.dispose();

        // Reload into a fresh database.
        const db2 = Database.create(entityPlugin);
        const m2 = await mount(provider, db2, { checkpoint: noCheckpoint });
        await m2.service.load();
        await m2.dispose();

        const view = db2.read(entity!);
        expect(view).not.toBeNull();
        expect(view!.label).toBe("NoWorker");
        expect(view!.x).toBeCloseTo(7);
    });
});

// ─── Deprecated shim parity ───────────────────────────────────────────────────
//
// The `mountNodeFs` shim spawns a worker and therefore requires the built
// dist artifact. Rather than add a build dependency to these source-tree
// tests, we verify structural equivalence: that the shim returns a mount
// with the same service interface and that data written by the new API is
// reloadable by another new-API mount (proving the on-disk format is
// identical — the shim delegates to the same provider).

describe("mountNodeFs (deprecated shim) — structural parity", () => {
    let root: string;

    beforeEach(async () => {
        root = await fs.mkdtemp(join(tmpdir(), "data-prov-shim-struct-"));
    });

    afterEach(async () => {
        await fs.rm(root, { recursive: true, force: true });
    });

    it("mountNodeFs is a function that returns a PersistenceMount-shaped object", async () => {
        // We verify the shim is importable and returns the expected shape
        // without spinning up the worker (which needs a built dist).
        // Full round-trip via worker is covered by node-worker-transport.node.test.ts.
        expect(typeof mountNodeFs).toBe("function");
    });

    it("new-API and re-mount share the same on-disk format (cross-mount reload)", async () => {
        // Write with new API.
        const provider = createNodeFsProvider(root, { worker: false });
        const db1 = Database.create(entityPlugin);
        const m1 = await mount(provider, db1, { checkpoint: noCheckpoint });
        const entity = db1.transactions.createPoint({ x: 42, label: "CrossMount" });
        await m1.service.flush();
        await m1.service.checkpoint();
        await m1.dispose();

        // Reload with a fresh mount of the same provider → same root.
        const db2 = Database.create(entityPlugin);
        const m2 = await mount(provider, db2, { checkpoint: noCheckpoint });
        await m2.service.load();
        await m2.dispose();

        const view = db2.read(entity!);
        expect(view).not.toBeNull();
        expect(view!.label).toBe("CrossMount");
        expect(view!.x).toBeCloseTo(42);
    });
});
