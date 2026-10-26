// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Rule } from "../../interface/rule/rule.js";
import { System } from "../../interface/system/system.js";
import { createWorld } from "../index.js";
import { readResource } from "./reads.test-helper.js";
import { Entity, F32, I32, Mat4x4, Quat, U32, Vec2, Vec3, Vec4 } from "../../index.js";

const pool = Symbol();
const names = Symbol();
const count = Symbol();
const tagged = Symbol();
const index = Symbol();
const turn = Symbol();
const least = Symbol();
const all = Symbol();

/** A pool declared through an alias of ReadonlyMap. */
type Pool = ReadonlyMap<string, number>;

declare module "@adobe/ecs" {
    export interface Components {
        [tagged]: { type: true };
        [index]: { type: ReadonlyMap<string, number>; derived: true };
    }
    export interface Resources {
        [pool]: { type: Pool };
        [names]: { type: ReadonlyMap<string, number> };
        [count]: { type: number };
        [turn]: { type: Quat };
        [least]: { type: F32; reduce: "min" };
        [all]: { type: boolean; reduce: "&" };
    }
}

Rule.create({ components: { with: [tagged] }, derive: [index] });

describe("a resource declared without a default", () => {
    it("starts at its type's zero value, and a ReadonlyMap or ReadonlySet at an empty one of its world's own", async () => {
        await using first = createWorld();
        await using second = createWorld();
        const [firstPool, secondPool] = [await readResource(first, pool), await readResource(second, pool)];
        expect(firstPool).toEqual(new Map());
        expect(secondPool).toEqual(new Map());
        expect(firstPool).not.toBe(secondPool);
        expect(await readResource(first, pool)).toBe(firstPool);
        expect(await readResource(first, names)).toEqual(new Map());
        expect(await readResource(first, count)).toBe(0);
    });
});

describe("a derived component declared without a default", () => {
    it("starts every row of a world at one empty Map of its own, since values are replaced whole", async () => {
        const spawn = System.create(({ commands }) => {
            commands.spawn([tagged])({});
            commands.spawn([tagged])({});
        });
        const seen: unknown[] = [];
        const read = System.create({ observer: true, components: { with: [index] } }, row => { seen.push(row[index]); });
        await using first = createWorld();
        await using second = createWorld();
        for (const world of [first, second]) {
            await world.run(spawn);
            await world.run(read);
        }
        expect(seen).toHaveLength(4);
        expect(seen[0]).toEqual(new Map());
        expect(seen[1]).toBe(seen[0]);
        expect(seen[3]).toBe(seen[2]);
        expect(seen[2]).not.toBe(seen[0]);
    });
});

describe("the package's types' defaults", () => {
    it("are zeros, identities, and none for an entity", () => {
        expect([F32.default, I32.default, U32.default, Vec2.default, Vec3.default, Vec4.default, Vec3.I32.default, Vec4.U32.default, Entity.default])
            .toEqual([0, 0, 0, [0, 0], [0, 0, 0], [0, 0, 0, 0], [0, 0, 0], [0, 0, 0, 0], Entity.none]);
        expect([Quat.default, Mat4x4.default]).toEqual([Quat.identity, Mat4x4.identity]);
    });
    it("start a world's resources, and a reduction its operator's identity", async () => {
        await using world = createWorld();
        expect(await readResource(world, turn)).toEqual([0, 0, 0, 1]);
        expect(await readResource(world, least)).toBe(Infinity);
        expect(await readResource(world, all)).toBe(true);
    });
});
