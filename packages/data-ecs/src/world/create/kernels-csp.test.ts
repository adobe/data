import { describe, expect, it } from "vitest";
import { Component } from "../../component/component.js";
import { System } from "../../system/system.js";
import { createWorld } from "./create.js";

const value = "kernelsCspTest/value";

declare module "../../component/types.js" {
    export interface Types {
        [value]: { type: number };
    }
}
declare module "../../system/types.js" {
    export interface Types {
        "kernelsCspTest/seed": true;
        "kernelsCspTest/double": true;
    }
}

Component.register(value, { type: { type: "number", precision: 1 } });

const seed = System.create({ name: "kernelsCspTest/seed" }, (_, __, commands) => {
    for (let i = 0; i < 10; i++) commands.spawn({ [value]: i });
});

const double = System.create({ name: "kernelsCspTest/double", kernel: "cpu", query: { read: [value], write: [value] } }, row => {
    row[value] = row[value] * 2;
});

describe("kernels where WASM can't be compiled", () => {
    it("run as JS", async () => {
        const compile = WebAssembly.compile;
        // A content security policy without 'wasm-unsafe-eval' makes compiling throw.
        WebAssembly.compile = () => Promise.reject(new WebAssembly.CompileError("blocked"));
        try {
            const world = createWorld({ workers: 0 });
            await world.systems.register(seed, double);
            await world.run(seed);
            await world.run(double);
            expect(world.query.select([value]).map(entity => world.read.component(entity, value))).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18]);
            await world.dispose();
        }
        finally {
            WebAssembly.compile = compile;
        }
    });
});
