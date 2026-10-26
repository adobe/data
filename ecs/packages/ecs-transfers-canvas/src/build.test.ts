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

it("the transfers sample builds as an application, with the world's worker and the loader's", async () => {
    const output = await build({
        configFile: join(packageRoot, "vite.config.ts"), root: join(packageRoot, "src"), logLevel: "silent",
        build: { outDir, emptyOutDir: true },
    });
    const items = (Array.isArray(output) ? output : [output]).flatMap((result: Rollup.RollupOutput | Rollup.RollupWatcher) => "output" in result ? result.output : []);
    const files = items.map(item => item.fileName);
    expect(files.some(file => file.includes("world"))).toBe(true);
    expect(files.some(file => file.includes("loader"))).toBe(true);
    // The page's urls for its workers name each worker's own entry, holding its code, not a kernel's chunk.
    const main = items.find((item): item is Rollup.OutputChunk => item.type === "chunk" && item.isEntry && item.code.includes("transferControlToOffscreen"));
    const urls = [...(main?.code ?? "").matchAll(/new Worker\(new URL\(\s*(?:\/\*[^*]*\*\/\s*)?["'`]([^"'`]+)["'`]/g)].map(match => match[1] ?? "");
    const named = (name: string) => urls.filter(url => new RegExp(`/${name}-[\\w-]+\\.js$`).test(url));
    expect(named("world")).toHaveLength(1);
    expect(named("loader")).toHaveLength(1);
    expect(urls.filter(url => url.includes("kernel-"))).toEqual([]);
    const code = (url: string) => readFileSync(join(outDir, url.replace(/^\//, "")), "utf8");
    expect(code(named("world")[0] ?? "")).toContain("ports");
    expect(code(named("loader")[0] ?? "")).toContain("image/png");
}, 30000);
