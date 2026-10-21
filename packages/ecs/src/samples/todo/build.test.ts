/// <reference types="node" />
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, expect, it } from "vitest";
import { build, type Rollup } from "vite";

const packageRoot = fileURLToPath(new URL("../../..", import.meta.url));
const outDir = realpathSync(mkdtempSync(join(tmpdir(), "ecs-sample-")));
afterAll(() => rmSync(outDir, { recursive: true, force: true }));

it("the todo sample builds as an application that defines its elements", async () => {
    const output = await build({
        configFile: join(packageRoot, "vite.sample.config.ts"), root: join(packageRoot, "src/samples/todo"), logLevel: "silent",
        build: { outDir, emptyOutDir: true },
    });
    const items = (Array.isArray(output) ? output : [output]).flatMap((result: Rollup.RollupOutput | Rollup.RollupWatcher) => "output" in result ? result.output : []);
    expect(items.some(item => item.fileName === "index.html")).toBe(true);
    const code = items.flatMap(item => item.type === "chunk" ? [item.code] : []).join("\n");
    for (const name of ["todo-row", "todo-list", "todo-entry", "todo-filters", "todo-summary", "todo-toggle-all", "todo-generate"]) expect(code).toMatch(new RegExp(`["'\`]${name}["'\`]`));
    expect(readFileSync(join(outDir, "index.html"), "utf8")).toContain("<todo-list>");
}, 30000);
