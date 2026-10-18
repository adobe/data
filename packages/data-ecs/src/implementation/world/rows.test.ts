import { describe, expect, it } from "vitest";
import { Component } from "../../interface/component/component.js";
import type { Entity } from "../../interface/entity/entity.js";
import type { Schema } from "../../interface/schema/schema.js";
import { System } from "../../interface/system/system.js";
import { readEach, select } from "./reads.test-helper.js";
import { createWorld } from "./create.js";
import { workers } from "../../interface/resources/workers.js";

type Vec3 = readonly [number, number, number];
const vec3 = { type: "array", items: { type: "number", precision: 1 }, minItems: 3, maxItems: 3 } as const satisfies Schema;
const position = Symbol("rowsTest/position");
const count = Symbol("rowsTest/count");
const flag = Symbol("rowsTest/flag");
const tag = Symbol("rowsTest/tag");

declare module "@adobe/data-ecs" {
    export interface Components {
        [position]: { type: readonly [number, number, number] };
        [count]: { type: number };
        [flag]: { type: boolean };
        [tag]: { type: true };
    }
}

Component.register(position, { type: vec3 });
Component.register(count, { type: { type: "integer", minimum: 0, maximum: 1000 } });
Component.register(flag, { type: { type: "boolean" } });
Component.register(tag, { type: { const: true } });

const seed = System.create({ name: "rowsTest/seed" }, ({ commands }) => {
    for (let i = 0; i < 4; i++) commands.spawn(i < 2 ? [position, count, flag, tag] : [position, count, flag])({ [position]: [i, i + 0.5, -i], [count]: i, [flag]: i % 2 === 0 });
});

describe("accessor rows", () => {
    it("are shared by systems with the same reads and writes, rebound per system and archetype", async () => {
        const seen: { entity: Entity; position: Vec3; count: number; flag: boolean }[] = [];
        const kept: Vec3[] = [];
        // Both run over two archetypes (with and without the tag), with a system using a different row between them.
        const first = System.create({ name: "rowsTest/first", components: { read: [position, flag], write: [count] } }, row => {
            const value = row[position];
            kept.push(value);
            seen.push({ entity: row.entity, position: value, count: row[count], flag: row[flag] });
            row[count] = row[count] + 10;
        });
        const other = System.create({ name: "rowsTest/other", components: { write: [position] }, after: [first] }, row => {
            const [x, y, z] = row[position];
            row[position] = [x + 100, y, z];
        });
        const second = System.create({ name: "rowsTest/second", components: { read: [position, flag], write: [count] }, after: [other] }, row => {
            seen.push({ entity: row.entity, position: row[position], count: row[count], flag: row[flag] });
            row[count] = row[count] + 1;
        });
        const world = createWorld({ [workers]: 0 });
        await world.run(seed);
        await world.run(first);
        await world.run(other);
        await world.run(second);
        const entities = await select(world, { required: [count] });
        const values = await readEach(world, entities, count);
        const byEntity = new Map(entities.map((entity, i) => [entity, values[i] ?? -1]));
        expect([...byEntity.values()].sort()).toEqual([11, 12, 13, 14]);
        expect(seen).toHaveLength(8);
        for (const { entity, position: value, count: initial, flag: even } of seen.slice(0, 4)) {
            expect(value).toEqual([initial, initial + 0.5, -initial]);
            expect(even).toBe(initial % 2 === 0);
            expect(byEntity.get(entity)).toBe(initial + 11);
        }
        for (const { entity, position: value, count: written } of seen.slice(4)) {
            const initial = written - 10;
            expect(value).toEqual([initial + 100, initial + 0.5, -initial]);
            expect(byEntity.get(entity)).toBe(written + 1);
        }
        // Read values are copies: later writes don't change a value a body kept.
        expect(kept.map(value => value[0]).sort()).toEqual([0, 1, 2, 3]);
        await world.dispose();
    });
});
