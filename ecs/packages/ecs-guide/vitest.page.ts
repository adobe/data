// © 2026 Adobe. MIT License. See /LICENSE for details.
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import type { TestProject } from "vitest/node";
import { serve } from "./serve.ts";

declare module "vitest" {
    export interface ProvidedContext {
        /** Where the built guide is served, cross-origin isolated by its headers. */
        readonly guide: string;
    }
}

/** Builds the guide into a folder of its own and serves it, as a static host does, with the isolation headers. */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
    const outDir = realpathSync(mkdtempSync(join(tmpdir(), "ecs-guide-")));
    await build({ configFile: fileURLToPath(new URL("vite.config.ts", import.meta.url)), logLevel: "warn", build: { outDir, emptyOutDir: true } });
    const server = await serve(outDir, { isolated: true });
    project.provide("guide", server.url);
    return async () => {
        await server.close();
        rmSync(outDir, { recursive: true, force: true });
    };
}
