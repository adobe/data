// © 2026 Adobe. MIT License. See /LICENSE for details.
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { instantiate as instantiateParser } from "@oxc-parser/binding-wasm32-wasip1/workerd";
import { beforeAll, expect, it } from "vitest";
import type { ParseModule } from "../../../ecs/src/implementation/compiler/memory-compiler.js";
import { oxcParse } from "../../../ecs/src/implementation/compiler/oxc.js";
import { budget, createGuard } from "../run/guard.js";
import { protect } from "./protect.js";

const require = createRequire(import.meta.url);
let parse: ParseModule;
beforeAll(async () => {
    const parser = await readFile(require.resolve("@oxc-parser/binding-wasm32-wasip1/wasm")).then(bytes => WebAssembly.compile(bytes)).then(instantiateParser);
    parse = oxcParse(parser);
});
const guarded = (code: string): string => protect(code, source => parse(source, { lang: "js" }));
const prefix = `import { loopGuard as __guideLoop, callGuard as __guideCall } from "@ecs-guide/guard"; `;

it("checks every loop's body and every function's, on the module's first line, so its lines stay where they were", () => {
    const code = [
        "for (let i = 0; i < 3; i++) { a(); }", "for (const x of xs) b(x);", "while (go()) c();", "do { d(); } while (go());", "for (const k in o) {}",
        "function f() { return 1; }", "const g = () => ({ a: 1 });", "const h = async () => { await e(); };", "class C { m() { return 2; } get v() { return 3; } }",
    ].join("\n");
    const result = guarded(code);
    expect(result.split("\n")).toEqual([
        `${prefix}for (let i = 0; i < 3; i++) { __guideLoop(); a(); }`, "for (const x of xs) { __guideLoop(); b(x); }", "while (go()) { __guideLoop(); c(); }",
        "do { __guideLoop(); d(); } while (go());", "for (const k in o) { __guideLoop();}", "function f() { __guideCall(); return 1; }",
        "const g = () => ((__guideCall(), { a: 1 }));", "const h = async () => { __guideCall(); await e(); };",
        "class C { m() { __guideCall(); return 2; } get v() { __guideCall(); return 3; } }",
    ]);
    // What's checked still parses.
    expect(() => parse(result, { lang: "js" })).not.toThrow();
});

it("places checks after text beyond ASCII, as offsets count it", () => {
    expect(guarded("const arrow = \"→ 😀\"; while (go()) step();")).toBe(`${prefix}const arrow = "→ 😀"; while (go()) { __guideLoop(); step(); }`);
});

it("leaves code with neither a loop nor a function as it is", () => {
    expect(guarded("export const a = 1;\n")).toBe("export const a = 1;\n");
});

it("stops a task that runs past the budget, and lets the next one run", () => {
    let time = 0;
    const tasks: (() => void)[] = [];
    const { loopGuard, callGuard } = createGuard(() => time, callback => void tasks.push(callback));
    const spin = (check: () => void, until: number): void => {
        for (; time < until; time += 0.01) check();
    };
    expect(() => spin(loopGuard, budget + 100)).toThrow(`This loop ran for over 1 s; the run stopped`);
    // The task ended: the next starts its own budget.
    for (const task of tasks.splice(0)) task();
    const started = time;
    expect(() => spin(callGuard, started + budget / 2)).not.toThrow();
    expect(() => spin(callGuard, started + budget + 100)).toThrow(`These calls ran for over 1 s; the run stopped`);
});
