// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { createWorld } from "../index.js";
import { readResource } from "./reads.test-helper.js";

const pool = Symbol();
const names = Symbol();
const count = Symbol();

declare module "@adobe/ecs" {
    export interface Resources {
        [pool]: { type: Map<string, number> };
        [names]: { type: ReadonlyMap<string, number> };
        [count]: { type: number };
    }
}

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
