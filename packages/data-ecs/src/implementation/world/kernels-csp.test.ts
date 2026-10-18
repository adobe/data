import { describe, expect, it } from "vitest";
import { Component } from "../../interface/component/component.js";
import { System } from "../../interface/system/system.js";
import { readEach, select } from "./reads.test-helper.js";
import { createWorld } from "./create.js";
import { workers } from "../../interface/resources/workers.js";

const value = Symbol("kernelsCspTest/value");

declare module "@adobe/data-ecs" {
    export interface Components {
        [value]: { type: number };
    }
}

Component.register(value, { type: { type: "number", precision: 1 } });

const seed = System.create({ name: "kernelsCspTest/seed" }, ({ commands }) => {
    for (let i = 0; i < 10; i++) commands.spawn({ [value]: i });
});

const double = System.create({ name: "kernelsCspTest/double", kernel: "cpu", components: { write: [value] } }, row => {
    row[value] = row[value] * 2;
});

describe("kernels where WASM can't be compiled", () => {
    it("run as JS", async () => {
        const compile = WebAssembly.compile;
        // A content security policy without 'wasm-unsafe-eval' makes compiling throw.
        WebAssembly.compile = () => Promise.reject(new WebAssembly.CompileError("blocked"));
        try {
            const world = createWorld({ [workers]: 0 });
            await world.run(seed);
            await world.run(double);
            expect(await readEach(world, await select(world, { required: [value] }), value)).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18]);
            await world.dispose();
        }
        finally {
            WebAssembly.compile = compile;
        }
    });
});
