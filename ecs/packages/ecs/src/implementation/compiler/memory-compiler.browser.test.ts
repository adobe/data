// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="vite/client" />
import { instantiate as instantiateParser } from "@oxc-parser/binding-wasm32-wasip1/workerd";
import parserUrl from "@oxc-parser/binding-wasm32-wasip1/wasm?url";
import { instantiate as instantiateTransformer } from "@oxc-transform/binding-wasm32-wasip1/workerd";
import transformerUrl from "@oxc-transform/binding-wasm32-wasip1/wasm?url";
import { expect, it } from "vitest";
import { createMemoryCompiler, type MemoryCompiled } from "./memory-compiler.js";
import { oxcParse, oxcStrip } from "./oxc.js";
import { gpu } from "../world/gpu.test-helper.js";

// The compiler's core in chromium: oxc's WASM bindings loaded as a page loads them, and the package's sources in
// memory, laid out as installed.

const root = "/node_modules/@adobe/ecs";
const sources: { readonly [path: string]: string } = import.meta.glob(["../../index.ts", "../../interface/**/*.ts", "!../../**/*.test.ts", "!../../**/*.type-test.ts"], { query: "?raw", import: "default", eager: true });
const guide: { readonly [path: string]: string } = import.meta.glob("../../guide/[0-9]*.ts", { query: "?raw", import: "default", eager: true });

/** The package's files in memory: each path relative to `src/implementation/compiler`, at the package's `src`. */
const files = new Map<string, string>([
    [`${root}/package.json`, JSON.stringify({ name: "@adobe/ecs", version: "0.0.0", exports: { ".": { import: "./dist/index.js" } } })],
    ...Object.entries({ ...sources, ...guide }).map(([path, text]): [string, string] => [`${root}/src/${path.slice("../../".length)}`, text]),
]);

const compilerOf = async () => {
    const [parser, transformer] = await Promise.all([
        WebAssembly.compileStreaming(fetch(parserUrl)).then(instantiateParser),
        WebAssembly.compileStreaming(fetch(transformerUrl)).then(instantiateTransformer),
    ]);
    return createMemoryCompiler({ files, packageRoot: root, parse: oxcParse(parser), strip: oxcStrip(transformer) });
};
let loading: ReturnType<typeof compilerOf> | null = null;

const compiled = async (file: string, code: string): Promise<MemoryCompiled> =>
    (await (loading ??= compilerOf())).compile(file, code, index => JSON.stringify(`kernel:${index}`));

it("compiles a guide module's kernels, keys and systems, from files in memory", async () => {
    const file = `${root}/src/guide/14-kernels.ts`;
    const result = await compiled(file, files.get(file) ?? "");
    if ("failure" in result) throw new Error(result.failure);
    expect(result.kernels).toHaveLength(2);
    expect(result.code).toContain(`"@adobe/ecs@0.0.0/src/guide/14-kernels.ts#position"`);
    expect(result.code).toContain(`"@adobe/ecs@0.0.0/src/guide/14-kernels.ts#drift"`);
    expect(result.code).toContain(`from "${root}/dist/implementation/world/attach-kernel.js"`);
    expect(result.code).toContain(`url: "kernel:1"`);
    // Each kernel's module runs as a module of its own.
    for (const kernel of result.kernels) {
        const module: unknown = await import(/* @vite-ignore */ `data:text/javascript,${encodeURIComponent(kernel)}`);
        expect(typeof Reflect.get(Object(module), "create")).toBe("function");
    }
});

it("fails a body the build rejects, located in the module's source", async () => {
    const file = `${root}/src/guide/03-systems.ts`;
    const source = files.get(file) ?? "";
    const edited = source.replace("(row, { resources }) => {\n    // Values", "async (row, { resources }) => {\n    // Values");
    const result = await compiled(file, edited);
    expect(result).toMatchObject({ failure: expect.stringContaining("a body can't be async"), location: { line: source.split("\n").findIndex(line => line.includes("// Values")) } });
});

it("fails a module that doesn't parse, at the error", async () => {
    const result = await compiled(`${root}/src/guide/broken.ts`, "import { System } from \"../index.js\";\nconst a = ;\n");
    expect(result).toMatchObject({ failure: expect.stringContaining("Unexpected token"), location: { line: 2 } });
});

it.runIf(gpu)("describes the systems of the kernel chapters, their WGSL a shader module the GPU compiles without an error", async () => {
    const shaders: string[] = [];
    for (const chapter of ["14-kernels", "16-gpu"]) {
        const file = `${root}/src/guide/${chapter}.ts`;
        const result = await (loading ??= compilerOf()).then(compiler => compiler.compile(file, files.get(file) ?? "", index => JSON.stringify(`kernel:${index}`), { describe: true }));
        if ("failure" in result) throw new Error(result.failure);
        const move = result.systems?.find(system => system.binding === "move");
        expect(move?.wasm).toMatchObject({ kind: "compiled", code: expect.stringContaining("(func $run (type 0) (param $start i32)") });
        for (const system of result.systems ?? []) if ("code" in system.wgsl) shaders.push(system.wgsl.code);
    }
    expect(shaders).toHaveLength(4);
    const adapter = await navigator.gpu?.requestAdapter();
    if (adapter === null || adapter === undefined) throw new Error("No WebGPU adapter.");
    const device = await adapter.requestDevice();
    for (const code of shaders) {
        const info = await device.createShaderModule({ code }).getCompilationInfo();
        expect(info.messages.filter(message => message.type === "error").map(message => message.message)).toEqual([]);
    }
    device.destroy();
});
