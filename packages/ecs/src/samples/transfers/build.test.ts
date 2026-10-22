// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="node" />
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, expect, it } from "vitest";
import { build, type Rollup } from "vite";

const packageRoot = fileURLToPath(new URL("../../..", import.meta.url));
const outDir = realpathSync(mkdtempSync(join(tmpdir(), "ecs-sample-")));
afterAll(() => rmSync(outDir, { recursive: true, force: true }));

it("the transfers sample builds as an application, with the world's worker and the loader's", async () => {
    const output = await build({
        configFile: join(packageRoot, "vite.sample.config.ts"), root: join(packageRoot, "src/samples/transfers"), logLevel: "silent",
        build: { outDir, emptyOutDir: true },
    });
    const items = (Array.isArray(output) ? output : [output]).flatMap((result: Rollup.RollupOutput | Rollup.RollupWatcher) => "output" in result ? result.output : []);
    const files = items.map(item => item.fileName);
    expect(files.some(file => file.includes("world"))).toBe(true);
    expect(files.some(file => file.includes("loader"))).toBe(true);
}, 30000);
