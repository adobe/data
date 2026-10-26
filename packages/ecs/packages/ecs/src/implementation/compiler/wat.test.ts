// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import createWabt from 'wabt';
import { describe, expect, it } from 'vitest';
import { printWat } from './wat.js';

const features = { simd: true, threads: true, sat_float_to_int: true };

/** The WAT's module as wabt assembles it, without names. */
const assemble = async (wat: string): Promise<Uint8Array> => {
    const wabt = await createWabt();
    const module = wabt.parseWat("printed.wat", wat, features);
    try {
        return module.toBinary({ write_debug_names: false }).buffer;
    } finally {
        module.destroy();
    }
};

const unsigned = (value: number): number[] => {
    const bytes: number[] = [];
    do {
        let byte = value & 0x7f;
        value >>>= 7;
        if (value !== 0) byte |= 0x80;
        bytes.push(byte);
    } while (value !== 0);
    return bytes;
};
const vector = (items: readonly (readonly number[])[]): number[] => [...unsigned(items.length), ...items.flat()];
const section = (id: number, content: readonly number[]): number[] => [id, ...unsigned(content.length), ...content];
const name = (text: string): number[] => [...unsigned(text.length), ...[...text].map(character => character.charCodeAt(0))];

/** A module as the generator lays one out: two types, the memory and a function imported, and `run` exporting `body`. */
const moduleOf = (body: readonly number[]): Uint8Array => {
    const code = [...vector([[1, 0x7c]]), ...body, 0x0b];
    return new Uint8Array([
        0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
        ...section(1, vector([[0x60, ...vector([[0x7f], [0x7c]]), ...vector([])], [0x60, ...vector([[0x7c], [0x7c]]), ...vector([[0x7c]])]])),
        ...section(2, vector([[...name("env"), ...name("memory"), 0x02, 0x03, 1, ...unsigned(65536)], [...name("math"), ...name("sin"), 0x00, 1]])),
        ...section(3, vector([[0]])),
        ...section(7, vector([[...name("run"), 0x00, 1]])),
        ...section(10, vector([[...unsigned(code.length), ...code]])),
    ]);
};

/** The generator's own opcodes, read from its source: its `op` table, its SIMD `vop` table, and its 0xfc-prefixed ones. */
const generatorOpcodes = (): { readonly plain: readonly number[]; readonly simd: readonly number[]; readonly saturating: readonly number[] } => {
    const source = readFileSync(fileURLToPath(new URL("../world/wasm.ts", import.meta.url)), "utf8");
    const table = (name: string): number[] => {
        const found = new RegExp(`const ${name} = \\{([^}]*)\\} as const;`).exec(source);
        if (found === null) throw new Error(`no ${name} table`);
        return [...new Set([...(found[1] ?? "").matchAll(/\w+: (0x[0-9a-f]+|\d+)/g)].map(match => Number(match[1])))];
    };
    const saturating = [...new Set([...source.matchAll(/\[0xfc, (0x[0-9a-f]+)\]/g)].map(match => Number(match[1])))];
    return { plain: table("op"), simd: table("vop"), saturating };
};

/** One instruction of each opcode, with immediates the spec gives it, nested blocks closed. */
const instruction = (opcode: number): number[] => {
    if (opcode === 0x02 || opcode === 0x03 || opcode === 0x04) return [opcode, 0x40, 0x0b];
    // An empty else is dropped by an assembler; the generator's always has a body.
    if (opcode === 0x05) return [0x04, 0x40, 0x01, 0x05, 0x01, 0x0b];
    if (opcode === 0x0b) return [0x02, 0x7c, 0x44, ...new Array<number>(8).fill(0), 0x0b];
    if (opcode === 0x0c || opcode === 0x0d) return [opcode, 0];
    if (opcode === 0x10) return [opcode, 0];
    if (opcode >= 0x20 && opcode <= 0x22) return [opcode, 2];
    if (opcode === 0x41) return [opcode, 0x7b];
    if (opcode === 0x42) return [opcode, 0x80, 0x7f];
    if (opcode === 0x44) return [opcode, ...new Uint8Array(new Float64Array([-1.5e-7]).buffer)];
    if (opcode >= 0x28 && opcode <= 0x3e) return [opcode, 0, 16];
    return [opcode];
};
const simdInstruction = (subopcode: number): number[] => {
    if (subopcode === 12) return [0xfd, subopcode, ...new Uint8Array(new Float32Array([1, -2.5, 0, 1e9]).buffer)];
    if (subopcode === 0 || subopcode === 11) return [0xfd, subopcode, 4, 32];
    if (subopcode === 92) return [0xfd, subopcode, 2, 8];
    if (subopcode === 93) return [0xfd, subopcode, 3, 8];
    if (subopcode === 90) return [0xfd, subopcode, 2, 8, 2];
    if (subopcode === 91) return [0xfd, subopcode, 3, 8, 1];
    return [0xfd, ...unsigned(subopcode)];
};

describe("the WAT printer", () => {
    it("prints every opcode the generator emits as text wabt assembles to the same bytes", async () => {
        const { plain, simd, saturating } = generatorOpcodes();
        expect(plain.length).toBeGreaterThan(60);
        expect(simd.length).toBeGreaterThan(50);
        expect(saturating).toEqual(expect.arrayContaining([0x03, 0x06, 0x07]));
        const body = [...plain.flatMap(instruction), ...simd.flatMap(simdInstruction), ...saturating.flatMap(subopcode => [0xfc, subopcode])];
        const bytes = moduleOf(body);
        const printed = printWat(bytes);
        if ("failure" in printed) throw new Error(printed.failure);
        expect(await assemble(printed.wat)).toEqual(bytes);
    });

    it("prints floats exactly, with infinities, NaNs and their payloads, and -0", async () => {
        const values = [0.1, -0, Infinity, -Infinity, NaN, 5e-324, 1.7976931348623157e308, 123456789.125];
        const doubles = values.flatMap(value => [0x44, ...new Uint8Array(new Float64Array([value]).buffer), 0x1a]);
        // A NaN with a payload other than the canonical one, and a negative one.
        const payload = [0x44, 1, 0, 0, 0, 0, 0, 0xf8, 0x7f, 0x1a, 0x44, 0, 0, 0, 0, 0, 0, 0xf8, 0xff, 0x1a];
        const vectors = [[1, 2], [0.5, -3]].flatMap(pair => [0xfd, 12, ...new Uint8Array(new Float64Array(pair).buffer), 0x1a]);
        const integers = [0xfd, 12, ...new Uint8Array(new Uint32Array([0x7fc00001, 0, 0xffffffff, 3]).buffer), 0x1a];
        const bytes = moduleOf([...doubles, ...payload, ...vectors, ...integers]);
        const printed = printWat(bytes);
        if ("failure" in printed) throw new Error(printed.failure);
        expect(printed.wat).toContain("f64.const nan:0x8000000000001");
        expect(printed.wat).toContain("f64.const -nan");
        expect(printed.wat).toContain("v128.const f64x2 1 2");
        expect(await assemble(printed.wat)).toEqual(bytes);
    });

    it("names the function, its imports, parameters and locals from a name section, and reads them back", async () => {
        const names = section(0, [...name("name"),
            ...section(1, vector([[0, ...name("sin")], [1, ...name("run")]])),
            ...section(2, vector([[1, ...vector([[0, ...name("start")], [1, ...name("tick")], [2, ...name("x 1")]])]]))]);
        const bytes = new Uint8Array([...moduleOf([0x20, 2, 0x20, 1, 0x10, 0, 0x1a]), ...names]);
        const printed = printWat(bytes);
        if ("failure" in printed) throw new Error(printed.failure);
        expect(printed.wat).toContain("(func $run (type 0) (param $start i32) (param $tick f64)");
        expect(printed.wat).toContain("(local $x_1 f64)");
        expect(printed.wat).toContain("call $sin");
        expect(printed.wat).toContain(`(export "run" (func $run))`);
        expect(await assemble(printed.wat)).toEqual(moduleOf([0x20, 2, 0x20, 1, 0x10, 0, 0x1a]));
    });

    it("says why it can't print bytes that aren't a module it reads", () => {
        expect(printWat(new Uint8Array([1, 2, 3]))).toEqual({ failure: "the module ends early at byte 0" });
        expect(printWat(new Uint8Array([0, 0x61, 0x73, 0x6d, 2, 0, 0, 0]))).toEqual({ failure: "the bytes aren't a WASM module of version 1 at byte 8" });
        expect(printWat(moduleOf([0xd2, 0]))).toMatchObject({ failure: expect.stringContaining("opcode 0xd2 isn't one the printer reads") });
        expect(printWat(moduleOf([0xfd, 0x80, 0x02]))).toMatchObject({ failure: expect.stringContaining("opcode 0xfd 256 isn't one the printer reads") });
    });
});
