// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="node" />
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, expect, it } from "vitest";
import { build, type Rollup } from "vite";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const outDir = realpathSync(mkdtempSync(join(tmpdir(), "ecs-sample-")));
afterAll(() => rmSync(outDir, { recursive: true, force: true }));

it("the views sample builds as an application, with the world's worker and its GPU kernel", async () => {
    const output = await build({
        configFile: join(packageRoot, "vite.config.ts"), root: join(packageRoot, "src"), logLevel: "silent",
        build: { outDir, emptyOutDir: true },
    });
    const items = (Array.isArray(output) ? output : [output]).flatMap((result: Rollup.RollupOutput | Rollup.RollupWatcher) => "output" in result ? result.output : []);
    // The page's url for the world's worker names its own entry, holding the world and ecs-gpu's systems.
    const main = items.find((item): item is Rollup.OutputChunk => item.type === "chunk" && item.isEntry && item.code.includes("transferControlToOffscreen"));
    const urls = [...(main?.code ?? "").matchAll(/new Worker\(new URL\(\s*(?:\/\*[^*]*\*\/\s*)?["'`]([^"'`]+)["'`]/g)].map(match => match[1] ?? "");
    const world = urls.filter(url => /\/world-[\w-]+\.js$/.test(url));
    expect(world).toHaveLength(1);
    expect(readFileSync(join(outDir, (world[0] ?? "").replace(/^\//, "")), "utf8")).toContain("copyTextureToTexture");
    expect(items.some(item => item.type === "chunk" && item.name.startsWith("kernel-"))).toBe(true);
}, 30000);
