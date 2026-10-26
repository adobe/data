// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="node" />
import { mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, expect, it } from "vitest";
import { build } from "vite";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const outDir = realpathSync(mkdtempSync(join(tmpdir(), "ecs-guide-build-")));
afterAll(() => rmSync(outDir, { recursive: true, force: true }));

it("the guide builds as a page served from anywhere, with its workers, its service worker, its runtime and oxc's WASM", async () => {
    await build({ configFile: join(packageRoot, "vite.config.ts"), logLevel: "silent", build: { outDir, emptyOutDir: true } });
    const page = readFileSync(join(outDir, "index.html"), "utf8");
    expect(page).toContain("<title>Guide</title>");
    expect(page).toMatch(/src="\.\/assets\/index-[\w-]+\.js"/);
    const assets = readdirSync(join(outDir, "assets"));
    for (const name of ["compiler", "typescript", "runtime", "service-worker", "parser.wasm32-wasip1", "transform.wasm32-wasip1"]) {
        expect([name, assets.some(asset => asset.startsWith(`${name}-`))]).toEqual([name, true]);
    }
    const runtime = readFileSync(join(outDir, "assets", assets.find(asset => asset.startsWith("runtime-")) ?? ""), "utf8");
    // The runtime's world starts its workers from its own bundle.
    expect(runtime).toMatch(/new Worker\(new URL\(/);
}, 120000);
