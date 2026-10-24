// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Index } from "../../interface/indexes/index-type.js";
import { workers } from "../../interface/resources/workers.js";
import { System } from "../../interface/system/system.js";
import { createWorld } from "./create.js";
import type { Vec2 } from "../../interface/math/index.js";
import type { Schema } from "../../interface/schema/schema.js";

const spot = Symbol("indexBuildCspTest/spot");
const size = Symbol("indexBuildCspTest/size");
const bulk = Symbol("indexBuildCspTest/bulk");
declare module "@adobe/ecs" {
    interface Components {
        [spot]: { type: Vec2.I32 };
        [size]: { type: number };
        [bulk]: { type: Schema.Type<{ type: "number"; precision: 2 }> };
    }
}

/** A key of a pair of i32s and an f64, so the steps encode three kinds of leaf. */
const bySpot = Index.create({ key: [spot, bulk], components: { with: [size] } });
const count = 70_000;

describe("index builds in phases where code can't be generated", () => {
    it("list keys in a loop over their leaves, building the same index", async () => {
        const generate = globalThis.Function;
        // A content security policy without 'unsafe-eval' makes `new Function` throw.
        globalThis.Function = new Proxy(generate, { construct: () => { throw new EvalError("blocked"); } });
        try {
            await using world = createWorld({ [workers]: 0 });
            await world.run(System.create(({ commands }) => {
                for (let k = 0; k < count; k++) commands.spawn([spot, size, bulk])({ [spot]: [k % 37 - 18, k % 11], [size]: k, [bulk]: (k % 3) / 4 });
            }));
            const expected = new Map<string, number[]>();
            await world.run(System.create({ components: { with: [spot, size, bulk] } }, row => {
                const text = `${row[spot][0]},${row[spot][1]},${row[bulk]}`;
                const held = expected.get(text) ?? [];
                held.push(row[size]);
                expected.set(text, held);
            }));
            const found = new Map<string, number[]>();
            await world.run(System.create({ lookup: { at: { index: bySpot } } }, ({ lookup }) => {
                for (const text of expected.keys()) {
                    const [x, y, b] = text.split(",").map(Number);
                    const list = lookup.at([x, y], b);
                    found.set(text, Array.from({ length: list.length }, (_, i) => list.at(i)[size]));
                }
            }));
            // Rows were spawned in entity order, so each bucket's sizes ascend.
            expect(found).toEqual(new Map([...expected].map(([text, sizes]) => [text, [...sizes].sort((a, b) => a - b)])));
            expect((await world.tables()).phasedBuilds).toBe(1);
        }
        finally {
            globalThis.Function = generate;
        }
    });
});
