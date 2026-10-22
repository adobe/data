// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Component } from "../../interface/component/component.js";
import { Index } from "../../interface/indexes/index-type.js";
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import { createWorld } from "./create.js";

const spot = Symbol("indexLookupsCspTest/spot");
const size = Symbol("indexLookupsCspTest/size");
declare module "@adobe/ecs" {
    interface Components {
        [spot]: { type: readonly [number, number] };
        [size]: { type: number };
    }
}
Component.register(spot, { type: { type: "array", items: { type: "integer", minimum: -100, maximum: 100 }, minItems: 2, maxItems: 2 } });
Component.register(size, { type: { type: "number" } });

const bySpot = Index.create({ key: [spot], components: { has: [size] } });
const bySize = Index.create({ key: [size], sorted: true, unique: true });

describe("index lookups where code can't be generated", () => {
    it("encode their keys in a loop, finding the same rows", async () => {
        const generate = globalThis.Function;
        // A content security policy without 'unsafe-eval' makes `new Function` throw.
        globalThis.Function = new Proxy(generate, { construct: () => { throw new EvalError("blocked"); } });
        try {
            await using world = createWorld({ [workers]: 0 });
            await world.run(System.create(({ commands }) => {
                for (let k = 0; k < 6; k++) commands.spawn([spot, size])({ [spot]: [k % 2, 0], [size]: k });
            }));
            let found: number[] = [];
            await world.run(System.create({ lookup: { at: { index: bySpot, read: [size] }, sized: { index: bySize, read: [size] } } }, ({ lookup }) => {
                const list = lookup.at([1, 0]);
                const range = lookup.sized({ ">": 1, "<=": 4 });
                found = [...Array.from({ length: list.length }, (_, i) => list.at(i)[size]), -1, ...Array.from({ length: range.length }, (_, i) => range.at(i)[size]), -1, lookup.sized(5)?.[size] ?? -2];
            }));
            expect(found).toEqual([1, 3, 5, -1, 2, 3, 4, -1, 5]);
        }
        finally {
            globalThis.Function = generate;
        }
    });
});
