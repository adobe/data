// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import createWabt from 'wabt';
import { beforeAll, describe, expect, it } from 'vitest';
import { definitionOf } from '../../interface/registry/index.js';
import type { System } from '../../interface/system/system.js';
import { kernelOf } from '../world/attach-kernel.js';
import { bindKernel } from '../world/kernels.js';
import { createState, idOf } from '../world/state.js';
import type { Backend } from './describe.js';
import * as fixture from './describe.test-helper.js';
import { createMemoryCompiler, type MemoryCompiler, type SystemDescription } from './memory-compiler.js';
import { wasmHost } from './oxc.test-helper.js';

const root = fileURLToPath(new URL("../../..", import.meta.url)).replace(/\/$/, "");
const filesIn = (folder: string, extension: string): readonly string[] =>
    readdirSync(`${root}/${folder}`, { recursive: true, encoding: "utf8" }).filter(file => file.endsWith(extension)).map(file => `${root}/${folder}/${file}`);
const files = new Map([`${root}/package.json`, ...filesIn("src", ".ts"), ...filesIn("dist", ".js")].map(file => [file, readFileSync(file, "utf8")]));
const helper = `${root}/src/implementation/compiler/describe.test-helper.ts`;
const source = files.get(helper) ?? "";

let compiler: MemoryCompiler;
let systems: ReadonlyMap<string | null, SystemDescription>;
beforeAll(async () => {
    const { parse, strip } = await wasmHost();
    compiler = createMemoryCompiler({ files, packageRoot: root, parse, strip });
    const compiled = await compiler.compile(helper, source, index => JSON.stringify(`kernel:${index}`), { describe: true });
    if ("failure" in compiled) throw new Error(compiled.failure);
    systems = new Map((compiled.systems ?? []).map(system => [system.binding, system]));
}, 60000);

const described = (binding: string | null): SystemDescription => {
    const system = systems.get(binding);
    if (system === undefined) throw new Error(`no system ${binding}`);
    return system;
};
const codeOf = (backend: Backend): string => "code" in backend ? backend.code : `no code: ${backend.reason}`;
const reasonOf = (backend: Backend): string => "reason" in backend ? backend.reason : "compiled";

const features = { simd: true, threads: true, sat_float_to_int: true };
/** A module's text as wabt prints it from its bytes, which no names or grouping of locals change. */
const canonical = async (bytes: Uint8Array): Promise<string> => {
    const wabt = await createWabt();
    const module = wabt.readWasm(bytes, { ...features, readDebugNames: false });
    try {
        return module.toText({ foldExprs: false });
    } finally {
        module.destroy();
    }
};
const assembled = async (wat: string): Promise<Uint8Array> => {
    const wabt = await createWabt();
    const module = wabt.parseWat("described.wat", wat, features);
    try {
        const { buffer } = module.toBinary({ write_debug_names: false });
        // Node validates shared memory, which wabt's validator doesn't take.
        if (!WebAssembly.validate(buffer)) throw new Error("the WAT assembles to a module that isn't valid");
        return buffer;
    } finally {
        module.destroy();
    }
};

/** A system's kernel bound as a world binds it, with `score`'s changes observed, as `filtered` observes them. */
const bound = (system: System<unknown>) => {
    const leaf = definitionOf(system);
    const description = kernelOf(system);
    if (leaf === undefined || leaf.kind === "composite" || description === undefined) throw new Error("not a compiled leaf");
    const state = createState(true);
    state.observed.add(idOf(state, fixture.score));
    return bindKernel(state, leaf, description);
};

describe("a module's systems described", () => {
    it("locates each system's call and names its binding", () => {
        const system = described("automatic");
        expect(source.slice(system.start, system.end)).toMatch(/^System\.create\(\{ components: \{ with: \[velocity, position\] \} \}[\s\S]*\}\)$/);
        expect(source.split("\n")[system.line - 1]?.slice(system.column - 1)).toMatch(/^System\.create\(/);
        expect([...systems.keys()]).toEqual(["automatic", "asserted", "shaded", "spawn", "observe", "named", "optional", "unflagged", "draw", "filtered", "looked", "summed", "inputs", "hypotenuse", null]);
    });

    it("gives an automatic kernel's JS, its WASM at the body's precision, and the shader it would be as a GPU kernel", () => {
        const system = described("automatic");
        expect(system).toMatchObject({ kind: "row", kernel: null, js: { kind: "compiled" }, wasm: { kind: "compiled" }, wgsl: { kind: "eligible", reason: expect.stringContaining("With `kernel: \"gpu\"`") } });
        expect(codeOf(system.js)).toContain("export const create = (booleans");
        expect(codeOf(system.js)).toContain("\n\t\trows: for (");
        expect(codeOf(system.wasm)).toContain("(func $run (type 0) (param $start i32) (param $end i32) (param $tick f64) (param $lastRun f64) (param $c0 i32)");
        expect(codeOf(system.wasm)).toContain("(local $x1_7 f64)");
        expect(codeOf(system.wasm)).toContain("f64.promote_f32");
        expect(codeOf(system.wgsl)).toContain("@compute @workgroup_size(64)");
        expect(system.runs).toMatch(/^WASM on the kernel pool's workers, (a row at a time|two f64 lanes at a time, bit-exact with the body as written); the JS kernel/);
    });

    it("gives a kernel: true kernel's WASM in f32 lanes at storage precision", () => {
        const system = described("asserted");
        expect(system).toMatchObject({ kernel: true, wasm: { kind: "compiled" }, runs: expect.stringContaining("four f32 lanes at a time, rounding each step to storage precision") });
        expect(codeOf(system.wasm)).toContain("f32x4.add");
    });

    it("gives a GPU kernel's shader, and the kernel it runs as on the CPU without a GPU", () => {
        const system = described("shaded");
        expect(system).toMatchObject({ kernel: "gpu", js: { kind: "compiled" }, wasm: { kind: "compiled" }, wgsl: { kind: "compiled" } });
        expect(system.runs).toMatch(/^A compute shader, in a world with a GPU device; in one without, WASM on the kernel pool's workers/);
        expect(codeOf(system.wgsl)).toContain("fn kernelRow(row: u32)");
    });

    it("says why systems that run as written have no code: per-run systems, observers, render systems, kernel: false and one declared in a function", () => {
        expect(described("spawn")).toMatchObject({ kind: "per-run", runs: `Its body as written, on the "world" thread` });
        for (const backend of ["js", "wasm", "wgsl"] as const) expect(reasonOf(described("spawn")[backend])).toBe("per-run systems run as written; only row systems compile");
        expect(described("observe")).toMatchObject({ kind: "observer", js: { kind: "none", reason: expect.stringMatching(/^an observer runs as written/) } });
        expect(described("draw")).toMatchObject({ kind: "render", runs: expect.stringContaining("while the world has a GPU device"), wgsl: { kind: "none", reason: expect.stringMatching(/^a render system runs as written/) } });
        const unflagged = described("unflagged");
        expect(unflagged).toMatchObject({ kernel: false, js: { kind: "none", reason: "as written, because `kernel: false`" }, wasm: { kind: "none", reason: "as written, because `kernel: false`" }, wgsl: { kind: "eligible" } });
        expect(described(null)).toMatchObject({ kind: "row", js: { kind: "none", reason: "it's declared inside a function, and kernels are declared at module scope" } });
    });

    it("says why a body reading a string runs as written, as registering its kernel finds", () => {
        const system = described("named");
        expect(reasonOf(system.js)).toBe("its body isn't a kernel: it reads label, a string, which kernels don't read yet");
        expect(reasonOf(system.wgsl)).toBe("GPU kernels need `kernel: \"gpu\"`, and this body can't be one: it reads label, a string, which kernels don't read yet");
        expect(system.runs).toBe(`Its body as written, on the "world" thread`);
    });

    it("says why a body reading an optional component has no WASM, and can't be a GPU kernel", () => {
        const system = described("optional");
        expect(system).toMatchObject({ js: { kind: "compiled" }, runs: "The JS kernel, on the kernel pool's workers" });
        expect(reasonOf(system.wasm)).toBe("it uses ??, which WASM and the GPU have no null for");
        expect(reasonOf(system.wgsl)).toMatch(/^GPU kernels need `kernel: "gpu"`, and this body can't be one: a GPU kernel can't have optional components/);
    });

    it("says why kernels with change filters, lookups and reductions can't be GPU kernels, from the GPU compile's own failures", () => {
        expect(reasonOf(described("filtered").wgsl)).toMatch(/a GPU kernel can't use change filters yet$/);
        expect(reasonOf(described("looked").wgsl)).toMatch(/a GPU kernel can't use lookups yet$/);
        expect(reasonOf(described("summed").wgsl)).toMatch(/a GPU kernel can't use reductions yet$/);
        expect(reasonOf(described("inputs").wgsl)).toMatch(/it reads an f64 value, such as an entity or a precision-2 number$/);
    });

    it("says why the WASM generator can't run a body its JS kernel runs", () => {
        expect(described("hypotenuse")).toMatchObject({ js: { kind: "compiled" }, runs: "The JS kernel, on the kernel pool's workers" });
        expect(reasonOf(described("hypotenuse").wasm)).toBe("it calls Math.hypot with more than two arguments, and WASM imports it taking two");
    });

    it("gives, for every kernel, the WASM and shader a world generates when it binds the kernel", async () => {
        const kernels = { automatic: fixture.automatic, asserted: fixture.asserted, shaded: fixture.shaded, optional: fixture.optional, filtered: fixture.filtered, looked: fixture.looked, summed: fixture.summed, inputs: fixture.inputs, hypotenuse: fixture.hypotenuse };
        for (const [binding, system] of Object.entries(kernels)) {
            const kernel = bound(system);
            const { wasm } = described(binding);
            if (kernel.wasm === null) {
                expect(wasm.kind, binding).toBe("none");
                continue;
            }
            expect(await canonical(await assembled(codeOf(wasm))), binding).toBe(await canonical(kernel.wasm.bytes));
        }
        const shader = bound(fixture.shaded).gpu();
        expect(codeOf(described("shaded").wgsl)).toBe(typeof shader === "string" ? shader : shader.code);
    });

    it("isn't given unless asked for, and costs the plugin's path nothing", async () => {
        const compiled = await compiler.compile(helper, source, index => JSON.stringify(`kernel:${index}`));
        expect(compiled).not.toHaveProperty("systems");
        const again = await compiler.compile(helper, source, index => JSON.stringify(`kernel:${index}`), { describe: true });
        if ("failure" in compiled || "failure" in again) throw new Error("a failure");
        expect(again.code).toBe(compiled.code);
        expect(again.kernels).toEqual(compiled.kernels);
    });
});
