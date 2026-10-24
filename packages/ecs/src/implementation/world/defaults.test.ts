// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Rule } from "../../interface/rule/rule.js";
import { System } from "../../interface/system/system.js";
import { createWorld } from "../index.js";
import { readResource } from "./reads.test-helper.js";

const pool = Symbol();
const names = Symbol();
const count = Symbol();
const tagged = Symbol();
const index = Symbol();

/** A pool declared through an alias of Map. */
type Pool = Map<string, number>;

declare module "@adobe/ecs" {
    export interface Components {
        [tagged]: { type: true };
        [index]: { type: ReadonlyMap<string, number>; derived: true };
    }
    export interface Resources {
        [pool]: { type: Pool };
        [names]: { type: ReadonlyMap<string, number> };
        [count]: { type: number };
    }
}

Rule.create({ components: { with: [tagged] }, derive: [index] });

describe("a resource declared without a default", () => {
    it("starts at its type's zero value, and a Map or Set at an empty one of its world's own", async () => {
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
