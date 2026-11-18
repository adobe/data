// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="node" />
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, expect, it } from "vitest";
import { build } from "vite";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const outDir = realpathSync(mkdtempSync(join(tmpdir(), "ecs-sample-")));
afterAll(() => rmSync(outDir, { recursive: true, force: true }));

it("the views sample builds as an application, with the world's worker and its GPU kernel", async () => {
    await build({
        configFile: join(packageRoot, "vite.config.ts"), root: join(packageRoot, "src"), logLevel: "silent",
        build: { outDir, emptyOutDir: true, manifest: true },
    });
    // The manifest, keyed by source path, says what each entry built, whatever the chunks are named. The world's
    // worker, bundled on its own, is an asset of the page's entry, holding the world and ecs-gpu's systems.
    const manifest: Record<string, { readonly file: string; readonly src?: string; readonly isEntry?: boolean; readonly assets?: readonly string[] }> =
        JSON.parse(readFileSync(join(outDir, ".vite", "manifest.json"), "utf8"));
    const page = manifest["index.html"];
    expect(page?.isEntry).toBe(true);
    const scripts = (page?.assets ?? []).filter(asset => asset.endsWith(".js"));
    expect(scripts).toHaveLength(1);
    expect(readFileSync(join(outDir, scripts[0] ?? ""), "utf8")).toContain("copyTextureToTexture");
    // The GPU kernel is an entry of its own, its source the module declaring `turn`.
    const kernels = Object.values(manifest).filter(chunk => chunk.isEntry === true && chunk.src !== undefined && chunk.src.includes("ecs-kernel:"));
    const sources = kernels.map(chunk => Buffer.from((chunk.src ?? "").split("ecs-kernel:")[1]?.split("/")[0] ?? "", "base64url").toString("utf8"));
    expect(sources.some(source => source.endsWith("/src/features/points/model/system.turn.ts"))).toBe(true);
}, 30000);
