// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="node" />
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, expect, it } from "vitest";
import { build, type Manifest } from "vite";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const outDir = realpathSync(mkdtempSync(join(tmpdir(), "ecs-sample-")));
afterAll(() => rmSync(outDir, { recursive: true, force: true }));

it("the transfers sample builds as an application, with the world's worker and the loader's", async () => {
    await build({
        configFile: join(packageRoot, "vite.config.ts"), root: join(packageRoot, "src"), logLevel: "silent",
        build: { outDir, emptyOutDir: true, manifest: true },
    });
    // Vite writes the manifest as JSON keyed by source file.
    const manifest = JSON.parse(readFileSync(join(outDir, ".vite", "manifest.json"), "utf8")) as Manifest;
    const page = manifest["index.html"];
    expect(page?.isEntry).toBe(true);
    // The manifest lists a page's workers as its assets, not under their source files: each is known by what it does.
    const workers = (page?.assets ?? []).map(file => readFileSync(join(outDir, file), "utf8"));
    expect(workers).toHaveLength(2);
    const loader = workers.filter(code => code.includes("image/png"));
    expect(loader).toHaveLength(1);
    expect(workers.find(code => !loader.includes(code))).toContain("ports");
}, 30000);
