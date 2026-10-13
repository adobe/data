import { describe, expect, it } from "vitest";
import { Component } from "../../component/component.js";
import { Entity } from "../../entity/entity.js";
import type { Schema } from "../../schema/schema.js";
import { System } from "../../system/system.js";
import { createWorld } from "./create.js";

type Vec2 = readonly [number, number];
const vec2: Schema.ForType<Vec2> = { type: "array", items: { type: "number", precision: 1 }, minItems: 2, maxItems: 2 };
const position = "semanticsTest/position";
const target = "semanticsTest/target";
const score = "semanticsTest/score";
const tag = "semanticsTest/tag";
declare module "../../component/types.js" {
    export interface Types {
        [position]: { type: Vec2 };
        [target]: { type: Entity };
        [score]: { type: number };
        [tag]: { type: true };
    }
}
declare module "../../system/types.js" {
    export interface Types {
        "semanticsTest/seed": true;
        "semanticsTest/chase": true;
        "semanticsTest/retag": true;
        "semanticsTest/watch": true;
    }
}
Component.register(position, { type: vec2 });
Component.register(target, { type: Entity.schema });
Component.register(score, { type: { type: "number" } });
Component.register(tag, { type: { const: true } });

const seed = System.create({ name: "semanticsTest/seed" }, (_, __, commands) => {
    // @ts-expect-error untyped callers can store any number as an entity
    commands.spawn({ [position]: [5, 6], [target]: -1, [score]: 0 });
    // @ts-expect-error untyped callers can store any number as an entity
    commands.spawn({ [position]: [7, 8], [target]: Number.NaN, [score]: 0 });
});
const chase = System.create({
    name: "semanticsTest/chase",
    kernel: "cpu",
    query: { read: [target], write: [score] },
    lookup: { targets: { read: [position] } },
}, (row, { targets }) => {
    const other = targets(row[target]);
    if (other === null) {
        row[score] = -1;
        return;
    }
    const [x] = other[position];
    row[score] = x;
});

const run = async (wasm: boolean) => {
    const world = createWorld({ wasm, workers: 0 });
    await world.systems.register(seed, chase);
    await world.run(seed);
    await world.run(chase);
    const result = world.query.select([score]).map(e => world.read.component(e, score));
    await world.dispose();
    return result;
};

describe("semantics", () => {
    it("a throwing sync point doesn't poison the next one or another world", async () => {
        let poison = false;
        const spawn = System.create({ name: "semanticsTest/seed" }, (_, __, commands) => {
            commands.spawn({ [score]: 1 });
            commands.spawn({ [score]: poison ? Symbol("x") as unknown as number : 2 });
        });
        const a = createWorld({ workers: 0 });
        const b = createWorld({ workers: 0 });
        await a.systems.register(spawn);
        await b.systems.register(spawn);
        await b.run(spawn);
        poison = true;
        await expect(a.run(spawn)).rejects.toThrow();
        poison = false;
        const errors: string[] = [];
        await b.run(spawn).catch(e => errors.push("b:" + String(e)));
        await a.run(spawn).catch(e => errors.push("a:" + String(e)));
        expect(errors).toEqual([]);
        // The value that can't be written throws when its spawn is issued, so only the spawn before it applies.
        expect([a.query.count([score]), b.query.count([score])]).toEqual([3, 4]);
    });
    it("lookup of -1 / NaN entity agrees between JS and WASM", async () => {
        const js = await run(false);
        const wasm = await run(true);
        expect(wasm).toEqual(js);
    });

    it("re-adding an existing tag keeps its added tick", async () => {
        const seen: number[] = [];
        let entity = Entity.none;
        const spawn = System.create({ name: "semanticsTest/seed" }, (_, __, commands) => { entity = commands.spawn({ [tag]: true, [score]: 0 }); });
        const retag = System.create({ name: "semanticsTest/retag" }, (_, __, commands) => { commands.add(entity, { [tag]: true }); });
        const watch = System.create({ name: "semanticsTest/watch", query: { has: [score], added: [tag] } }, row => { seen.push(row.entity); });
        const world = createWorld({ workers: 0 });
        await world.systems.register(spawn, retag, watch);
        await world.run(spawn);
        await world.run(watch);
        await world.run(retag);
        await world.run(watch);
        await world.dispose();
        expect(seen.length).toBe(1);
    });
});
