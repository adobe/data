// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="node" />
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, expect, it } from "vitest";
import { build, type Manifest, type Rollup } from "vite";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const outDir = realpathSync(mkdtempSync(join(tmpdir(), "ecs-sample-")));
afterAll(() => rmSync(outDir, { recursive: true, force: true }));

it("the GPU sample builds as an application, with the world's worker and each kernel's create", async () => {
    const output = await build({
        configFile: join(packageRoot, "vite.config.ts"), root: join(packageRoot, "src"), logLevel: "silent",
        build: { outDir, emptyOutDir: true, manifest: true },
    });
    const items = (Array.isArray(output) ? output : [output]).flatMap((result: Rollup.RollupOutput | Rollup.RollupWatcher) => "output" in result ? result.output : []);
    const files = new Map(items.map(item => [item.fileName, item]));
    // Vite writes the manifest it was asked for as JSON of this shape.
    const manifest: Manifest = JSON.parse(readFileSync(join(outDir, ".vite", "manifest.json"), "utf8"));
    // The page's entry, and the world's worker it starts.
    const page = manifest["index.html"];
    expect(page?.isEntry).toBe(true);
    expect(files.has(page?.file ?? "")).toBe(true);
    const workers = page?.assets ?? [];
    expect(workers.length).toBeGreaterThan(0);
    for (const worker of workers) expect(files.has(worker)).toBe(true);
    // Every url for a worker names one of those, not a kernel's chunk.
    const urls = items.flatMap(item => item.type === "chunk" ? [...item.code.matchAll(/new Worker\(new URL\(\s*(?:\/\*[^*]*\*\/\s*)?["'`]([^"'`]+)["'`]/g)].map(match => match[1] ?? "") : []);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(workers.some(worker => url.endsWith(worker.split("/").pop() ?? worker))).toBe(true);
    // Each kernel the compiler made is an entry of its own, exporting only its create.
    const kernels = Object.values(manifest).filter(chunk => chunk.isEntry === true && chunk.src !== "index.html");
    expect(kernels.length).toBeGreaterThan(0);
    for (const kernel of kernels) {
        const chunk = files.get(kernel.file);
        expect(chunk?.type === "chunk" ? chunk.exports : null).toEqual(["create"]);
    }
}, 30000);
