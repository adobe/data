// © 2026 Adobe. MIT License. See /LICENSE for details.
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { instantiate as instantiateParser } from "@oxc-parser/binding-wasm32-wasip1/workerd";
import { instantiate as instantiateTransformer } from "@oxc-transform/binding-wasm32-wasip1/workerd";
import { beforeAll, expect, it } from "vitest";
import { createMemoryCompiler, type MemoryCompiler } from "../../../ecs/src/implementation/compiler/memory-compiler.js";
import { oxcParse, oxcStrip } from "../../../ecs/src/implementation/compiler/oxc.js";
import { chapters, numbered } from "../content/guide.js";
import { compileRun } from "./compile-run.js";
import { protect } from "./protect.js";
import type { CompileRequest } from "./messages.js";
import { packageFiles } from "./package-files.js";
import { packageRoot } from "./run-files.js";

const require = createRequire(import.meta.url);
let compiler: MemoryCompiler;
let guard: (code: string) => string = code => code;
beforeAll(async () => {
    const [parser, transformer] = await Promise.all([
        readFile(require.resolve("@oxc-parser/binding-wasm32-wasip1/wasm")).then(bytes => WebAssembly.compile(bytes)).then(instantiateParser),
        readFile(require.resolve("@oxc-transform/binding-wasm32-wasip1/wasm")).then(bytes => WebAssembly.compile(bytes)).then(instantiateTransformer),
    ]);
    const parse = oxcParse(parser);
    compiler = createMemoryCompiler({ files: packageFiles, packageRoot, parse, strip: oxcStrip(transformer) });
    guard = code => protect(code, source => parse(source, { lang: "js" }));
});

const core = numbered(1)?.package ?? "";
const request = (files: CompileRequest["files"], owner = core): CompileRequest => ({ kind: "compile", run: 1, package: owner, files, runs: "https://guide/run/", runtime: "https://guide/runtime.js", packages: [{ name: owner, names: ["System"] }] });

it("compiles every chapter's files without a diagnostic, their kernels inlined, their ids naming the package", async () => {
    let kernels = 0;
    for (const chapter of chapters.filter(chapter => chapter.files.length > 0)) {
        const { diagnostics, files } = await compileRun(compiler, request(chapter.files.map(file => ({ name: file.name, code: file.source })), chapter.package), guard);
        expect([chapter.slug, diagnostics]).toEqual([chapter.slug, []]);
        // Past its page, the runtime's exports module and its package's.
        const modules = files?.slice(3) ?? [];
        expect(modules.map(file => file.path)).toEqual(chapter.files.map(file => `node_modules/${chapter.package}/src/guide/${file.name}`));
        for (const module of modules) {
            expect(module.text).not.toContain("@ecs-kernel-inline/");
            kernels += [...module.text.matchAll(/"data:text\/javascript;base64,/g)].length;
            // Each module's own code is protected from loops that never end, its kernels never.
            expect(module.text.startsWith(`import { loopGuard as __guideLoop, callGuard as __guideCall } from "@ecs-guide/guard";`)).toBe(true);
            for (const [, kernel = ""] of module.text.matchAll(/"data:text\/javascript;base64,([^"]+)"/g)) expect(atob(kernel)).not.toContain("__guide");
            if (module.text.includes("identify$(")) expect(module.text).toContain(`"${chapter.package}@`);
        }
    }
    expect(kernels).toBe(24);
});

it("reports what the build rejects as a diagnostic located in the file, and gives no run", async () => {
    const systems = numbered(3)?.files[0];
    if (systems === undefined) throw new Error("no 03-systems.ts");
    const edited = systems.source.replace("(row, { resources }) => {\n    // Values", "async (row, { resources }) => {\n    // Values");
    const { diagnostics, files } = await compileRun(compiler, request([{ name: systems.name, code: edited }]), guard);
    expect(files).toBeNull();
    const line = edited.split("\n").findIndex(text => text.includes("async (row")) + 1;
    expect(diagnostics).toEqual([expect.objectContaining({ kind: "build", severity: "error", file: systems.name, line, message: expect.stringContaining("a body can't be async") })]);
});

it("describes each system of every chapter, at its call in the file as given, with what each backend gives it", async () => {
    const counts = { compiled: 0, eligible: 0, registration: 0, none: 0 };
    for (const chapter of chapters.filter(chapter => chapter.files.length > 0)) {
        const sources = chapter.files.map(file => ({ name: file.name, code: file.source }));
        const { systems } = await compileRun(compiler, request(sources, chapter.package), guard);
        expect(systems.map(entry => entry.file)).toEqual(sources.map(source => source.name));
        for (const { file, systems: described } of systems) {
            const code = sources.find(source => source.name === file)?.code ?? "";
            for (const system of described) {
                expect(code.slice(system.start, system.end)).toMatch(/^System\.(create|render)\([\s\S]*\)$/);
                expect(code.split("\n")[system.line - 1]?.slice(system.column - 1)).toMatch(/^System\.(create|render)\(/);
                for (const backend of [system.js, system.wasm, system.wgsl]) counts[backend.kind]++;
            }
        }
    }
    expect(counts.compiled).toBeGreaterThan(30);
    expect(counts.eligible).toBeGreaterThan(3);
    expect(counts.none).toBeGreaterThan(100);
    const kernels = chapters.find(chapter => chapter.slug.startsWith("14-"));
    const { systems } = await compileRun(compiler, request(kernels?.files.map(file => ({ name: file.name, code: file.source })) ?? []), guard);
    expect(systems[0]?.systems.map(system => [system.binding, system.js.kind, system.wasm.kind, system.wgsl.kind])).toEqual([
        ["move", "compiled", "compiled", "eligible"],
        ["drift", "compiled", "compiled", "eligible"],
        ["slow", "none", "none", "eligible"],
        ["read", "none", "none", "none"],
        ["spawn", "none", "none", "none"],
    ]);
});

it("compiles a kernel whose body loops, its kernel holding no loop protection", async () => {
    const kernels = numbered(14)?.files[0];
    if (kernels === undefined) throw new Error("no 14-kernels.ts");
    const edited = kernels.source.replace("    row[position] = Vec3.add(row[position], row[velocity]);", "    for (let i = 0; i < 2; i++) row[position] = Vec3.add(row[position], row[velocity]);");
    expect(edited).not.toBe(kernels.source);
    const { diagnostics, files } = await compileRun(compiler, request([{ name: kernels.name, code: edited }]), guard);
    expect(diagnostics).toEqual([]);
    const module = files?.[3]?.text ?? "";
    const inlined = [...module.matchAll(/"data:text\/javascript;base64,([^"]+)"/g)].map(([, kernel = ""]) => atob(kernel));
    expect(inlined.length).toBe(2);
    for (const kernel of inlined) expect(kernel).not.toContain("__guide");
    expect(module).toContain("__guideLoop()");
});
