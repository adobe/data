import { describe, expect, it } from "vitest";
import { Component } from "../../component/component.js";
import type { Entity } from "../../entity/entity.js";
import type { Schema } from "../../schema/schema.js";
import { System } from "../../system/system.js";
import { createWorld } from "./create.js";

type Vec3 = readonly [number, number, number];
const vec3: Schema.ForType<Vec3> = { type: "array", items: { type: "number", precision: 1 }, minItems: 3, maxItems: 3 };
const position = "rowsTest/position";
const count = "rowsTest/count";
const flag = "rowsTest/flag";
const tag = "rowsTest/tag";

declare module "@adobe/data-ecs" {
    export interface Components {
        [position]: { type: Vec3 };
        [count]: { type: number };
        [flag]: { type: boolean };
        [tag]: { type: true };
    }
    export interface Systems {
        "rowsTest/seed": true;
        "rowsTest/first": true;
        "rowsTest/other": true;
        "rowsTest/second": true;
    }
}

Component.register(position, { type: vec3 });
Component.register(count, { type: { type: "integer", minimum: 0, maximum: 1000 } });
Component.register(flag, { type: { type: "boolean" } });
Component.register(tag, { type: { const: true } });

const seed = System.create({ name: "rowsTest/seed" }, (_, __, commands) => {
    for (let i = 0; i < 4; i++) commands.spawn({ [position]: [i, i + 0.5, -i], [count]: i, [flag]: i % 2 === 0, ...(i < 2 ? { [tag]: true } : {}) });
});

describe("accessor rows", () => {
    it("are shared by systems with the same reads and writes, rebound per system and archetype", async () => {
        const seen: { entity: Entity; position: Vec3; count: number; flag: boolean }[] = [];
        const kept: Vec3[] = [];
        // Both run over two archetypes (with and without the tag), with a system using a different row between them.
        const first = System.create({ name: "rowsTest/first", query: { read: [position, count, flag], write: [count] } }, row => {
            const value = row[position];
            kept.push(value);
            seen.push({ entity: row.entity, position: value, count: row[count], flag: row[flag] });
            row[count] = row[count] + 10;
        });
        const other = System.create({ name: "rowsTest/other", query: { read: [position], write: [position] }, after: ["rowsTest/first"] }, row => {
            const [x, y, z] = row[position];
            row[position] = [x + 100, y, z];
        });
        const second = System.create({ name: "rowsTest/second", query: { read: [position, count, flag], write: [count] }, after: ["rowsTest/other"] }, row => {
            seen.push({ entity: row.entity, position: row[position], count: row[count], flag: row[flag] });
            row[count] = row[count] + 1;
        });
        const world = createWorld({ workers: 0 });
        await world.systems.register(seed, first, other, second);
        await world.run(seed);
        await world.run(first);
        await world.run(other);
        await world.run(second);
        const entities = world.query.select([count]);
        const byEntity = new Map(entities.map(entity => [entity, world.read.component(entity, count) ?? -1]));
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
