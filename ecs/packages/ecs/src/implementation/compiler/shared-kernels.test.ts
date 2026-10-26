// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, test } from 'vitest';
import { parseAst } from 'vite';
import { transformKernels } from './transform.js';
import { createLinker } from './link.js';
import { nodeCopies, ownCopy } from './paths.js';
import { estreeOf } from './estree.js';

const parse = (code: string) => estreeOf(parseAst(code));

const header = `import { System } from "ecs";
const team = "team";
const cell = "cell";
const value = "value";
const other = "other";
`;

/** Transforms `source` as the module "/test.js", whose `team` and `cell` are declared shared. */
const transform = (source: string) => transformKernels(`${header}${source}`, "/test.js", parse, async specifier => specifier === "ecs" ? ownCopy : null, index => JSON.stringify(`kernel:${index}`), createLinker({
    packages: nodeCopies,
    shared: file => new Set(file === "/test.js" ? ["team", "cell"] : []),
    resolve: async specifier => specifier === "ecs" ? ownCopy.index : { error: `${specifier} can't be resolved` },
    load: async () => ({ error: "no files" }),
}, parse));

const failure = async (source: string): Promise<string> => {
    const result = await transform(source);
    return result !== null && "failure" in result ? result.failure.message : "compiled";
};

describe("kernels reading shared components", () => {
    test("read each call's archetype's value as a parameter", async () => {
        const result = await transform(`export const kernel = System.create({ kernel: true, components: { with: [cell, value] } }, row => { row[value] = row[cell][0] * 2 + row[cell][1]; });`);
        if (result === null || "failure" in result) throw new Error(result === null ? "no kernel" : result.failure.message);
        expect(result.code).toContain("shared: [cell],");
        const [kernel = ""] = result.kernels;
        expect(kernel).toContain("const h0 = shared[0];");
        expect(kernel).toContain("h0[0]");
        expect(kernel).toMatch(/\(columns, start, end, resources, lookups, keys, args, commands, tick, partials, partial, rows, parents, upColumns, found, shared\) =>/);
        // WASM and WGSL take it as a scalar parameter per call.
        expect(result.code).toContain(`{ "kind": "shared", "index": 0, "path": [0] }`);
    });
    test("never write one, read one optional, or read one through a lookup or up", async () => {
        expect(await failure(`export const kernel = System.create({ kernel: true, components: { with: [team, value] } }, row => { row[team] = 1; });`))
            .toContain("team is shared: its value is its archetype's, so a kernel reads it and never writes it");
        expect(await failure(`export const kernel = System.create({ kernel: true, components: { with: [value], optional: [cell] } }, row => { row[value] = row[cell]?.[0] ?? 0; });`))
            .toContain("cell is shared and optional, which kernels don't read yet");
        expect(await failure(`export const kernel = System.create({ kernel: true, components: { with: [other, value] }, lookup: { at: { with: [team] } } }, (row, { lookup }) => { row[value] = lookup.at(row[other])?.[team] ?? 0; });`))
            .toContain("team is shared, which a kernel reads only of its own rows");
        expect(await failure(`export const kernel = System.create({ kernel: true, components: { with: [value] } }, (row, { commands }) => { commands.add(row.entity, team, 1); });`))
            .toContain("team is shared: its value chooses an archetype, so only a system run as written on the world's thread spawns, adds or removes it");
    });
    test("tried, a body leaving the subset for one runs as written", async () => {
        const result = await transform(`export const tried = System.create({ components: { with: [team, value] } }, row => { row[team] = 1; });\nexport const moving = System.create({ components: { with: [value] } }, (row, { commands }) => { commands.add(row.entity, team, 1); });`);
        expect(result !== null && "failure" in result ? result.failure.message : result?.kernels ?? []).toEqual([]);
    });
});
