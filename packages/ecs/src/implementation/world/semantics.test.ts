// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Entity } from "../../interface/entity/entity.js";
import type { Schema } from "../../interface/schema/schema.js";
import { System } from "../../interface/system/system.js";
import { count, readEach, select } from "./reads.test-helper.js";
import { createWorld } from "./create.js";
import { workers } from "../../interface/resources/workers.js";
import { runReported } from "./reports.test-helper.js";

type Vec2 = readonly [number, number];
const vec2 = { type: "array", items: { type: "number", precision: 1 }, minItems: 2, maxItems: 2 } as const satisfies Schema;
const position = Symbol("semanticsTest/position");
const target = Symbol("semanticsTest/target");
const score = Symbol("semanticsTest/score");
const tag = Symbol("semanticsTest/tag");
declare module "@adobe/ecs" {
    export interface Components {
        [position]: { type: Schema.Type<{ type: "array"; items: { type: "number"; precision: 1 }; minItems: 2; maxItems: 2 }> };
        [target]: { type: Entity };
        [score]: { type: number };
        [tag]: { type: true };
    }
}

const seed = System.create({}, ({ commands }) => {
    // @ts-expect-error untyped callers can store any number as an entity
    commands.spawn([position, target, score])({ [position]: [5, 6], [target]: -1, [score]: 0 });
    // @ts-expect-error untyped callers can store any number as an entity
    commands.spawn([position, target, score])({ [position]: [7, 8], [target]: Number.NaN, [score]: 0 });
});
const chase = System.create({
    kernel: true,
    components: { with: [target, score] },
    lookup: { targets: { with: [position] } },
}, (row, { lookup: { targets } }) => {
    const other = targets(row[target]);
    if (other === null) {
        row[score] = -1;
        return;
    }
    const [x] = other[position];
    row[score] = x;
});

const run = async (wasm: boolean) => {
    const world = createWorld({ [workers]: 0 }, { wasm });
    await world.run(seed);
    await world.run(chase);
    const result = await readEach(world, await select(world, { required: [score] }), score);
    await world.dispose();
    return result;
};

describe("semantics", () => {
    it("a throwing sync point doesn't poison the next one or another world", async () => {
        let poison = false;
        const spawn = System.create({}, ({ commands }) => {
            commands.spawn([score])({ [score]: 1 });
            commands.spawn([score])({ [score]: poison ? Symbol("x") as unknown as number : 2 });
        });
        const a = createWorld({ [workers]: 0 });
        const b = createWorld({ [workers]: 0 });
        await b.run(spawn);
        poison = true;
        expect((await runReported(a, spawn)).failures).toHaveLength(1);
        poison = false;
        const errors: string[] = [];
        await b.run(spawn).catch(e => errors.push("b:" + String(e)));
        await a.run(spawn).catch(e => errors.push("a:" + String(e)));
        expect(errors).toEqual([]);
        // The value that can't be written throws when its spawn is issued, so only the spawn before it applies.
        expect([await count(a, { required: [score] }), await count(b, { required: [score] })]).toEqual([3, 4]);
    });
    it("lookup of -1 / NaN entity agrees between JS and WASM", async () => {
        const js = await run(false);
        const wasm = await run(true);
        expect(wasm).toEqual(js);
    });

    it("re-adding an existing tag keeps its added tick", async () => {
        const seen: number[] = [];
        let entity = Entity.none;
        const spawn = System.create({}, ({ commands }) => { entity = commands.spawn([tag, score])({ [tag]: true, [score]: 0 }); });
        const retag = System.create({}, ({ commands }) => { commands.add(entity, tag, true); });
        const watch = System.create({ components: { with: [score], added: [tag] } }, row => { seen.push(row.entity); });
        const world = createWorld({ [workers]: 0 });
        await world.run(spawn);
        await world.run(watch);
        await world.run(retag);
        await world.run(watch);
        await world.dispose();
        expect(seen.length).toBe(1);
    });
});
