// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="node" />
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, expect, it } from "vitest";
import { build, type Rollup } from "vite";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const outDir = realpathSync(mkdtempSync(join(tmpdir(), "ecs-sample-")));
afterAll(() => rmSync(outDir, { recursive: true, force: true }));

it("the GPU sample builds as an application, with the world's worker and each kernel's create", async () => {
    const output = await build({
        configFile: join(packageRoot, "vite.config.ts"), root: join(packageRoot, "src"), logLevel: "silent",
        build: { outDir, emptyOutDir: true },
    });
    const items = (Array.isArray(output) ? output : [output]).flatMap((result: Rollup.RollupOutput | Rollup.RollupWatcher) => "output" in result ? result.output : []);
    expect(items.some(item => item.fileName.includes("worker"))).toBe(true);
    // Every url for a worker names the world's worker entry, not a kernel's chunk.
    const urls = items.flatMap(item => item.type === "chunk" ? [...item.code.matchAll(/new Worker\(new URL\(\s*(?:\/\*[^*]*\*\/\s*)?["'`]([^"'`]+)["'`]/g)].map(match => match[1] ?? "") : []);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(url).toMatch(/\/worker-[\w-]+\.js$/);
    const kernels = items.filter((item): item is Rollup.OutputChunk => item.type === "chunk" && item.name.startsWith("kernel-"));
    expect(kernels.length).toBeGreaterThan(0);
    for (const kernel of kernels) expect(kernel.exports).toEqual(["create"]);
}, 30000);
