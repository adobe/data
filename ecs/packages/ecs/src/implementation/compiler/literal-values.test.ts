// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, test } from 'vitest';
import { parseAst } from 'vite';
import { transformKernels } from './transform.js';
import { createLinker } from './link.js';
import { nodeCopies, ownCopy } from './paths.js';
import { estreeOf } from './estree.js';

const parse = (code: string) => estreeOf(parseAst(code));

const header = `import { System } from "ecs";
const point = "point";
const amount = "amount";
`;

/** The JS kernel `source`'s system compiles to, as the module "/test.js". */
const kernelOf = async (source: string): Promise<string> => {
    const result = await transformKernels(`${header}${source}`, "/test.js", parse, async specifier => specifier === "ecs" ? ownCopy : null, index => JSON.stringify(`kernel:${index}`), createLinker({
        packages: nodeCopies,
        resolve: async specifier => specifier === "ecs" ? ownCopy.index : { error: `${specifier} can't be resolved` },
        load: async () => ({ error: "no files" }),
    }, parse));
    if (result === null || "failure" in result) throw new Error(result === null ? "no kernel" : result.failure.message);
    return result.kernels[0] ?? "";
};

describe("command values of literals", () => {
    test("are made once per call, before the rows", async () => {
        const kernel = await kernelOf(`export const add = System.create({ kernel: true, components: { with: [amount] } }, (row, { commands }) => { commands.add(row.entity, point, { x: 0, y: [1, 2] }); });`);
        const made = kernel.indexOf(`"x": 0`);
        expect(made).toBeGreaterThan(0);
        expect(made).toBeLessThan(kernel.indexOf("rows: for"));
    });

    test("that read the row are made in it", async () => {
        const kernel = await kernelOf(`export const add = System.create({ kernel: true, components: { with: [amount] } }, (row, { commands }) => { commands.add(row.entity, point, { x: row[amount], y: 0 }); });`);
        expect(kernel.indexOf(`"x":`)).toBeGreaterThan(kernel.indexOf("rows: for"));
    });
});
