// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import "../registry/declarations.js";
import { componentLists, lookupsLists, resourceUses, type Access } from "./resolve.js";

const mass = Symbol("resolveTest/mass");
const pool = Symbol("resolveTest/pool");
const position = Symbol("resolveTest/position");
declare module "@adobe/ecs" {
    interface Components {
        [mass]: { type: number };
        [position]: { type: number };
        [pool]: { type: ReadonlyMap<string, number>; derived: true };
    }
}
const access = (lookup: Access["lookup"]): Access => ({ components: null, resources: null, lookup, up: null, at: "a test" });

describe("lookupsLists", () => {
    it("takes a lookup whose rows the build didn't follow as reading everything it requires", () => {
        expect(lookupsLists({ others: { with: [mass, position] } }, access({ others: null }))).toEqual({ others: { read: [mass, position] } });
    });
    it("takes a lookup the body never used as reading nothing, and one it followed as reading what it read", () => {
        expect(lookupsLists({ others: { with: [mass, position] } }, access({}))).toEqual({ others: { has: [mass, position] } });
        expect(lookupsLists({ others: { with: [mass, position] } }, access({ others: [position] }))).toEqual({ others: { read: [position], has: [mass] } });
    });
});

describe("componentLists", () => {
    it("takes a row the build didn't follow as writing every member, its added and changed filters' included", () => {
        expect(componentLists({ with: [mass], changed: [position] }, null, false)).toEqual({ write: [mass, position], changed: [position] });
    });
    it("takes an observer's row the build didn't follow as reading every member, writing none", () => {
        expect(componentLists({ with: [mass], changed: [position] }, null, true)).toEqual({ read: [mass, position], changed: [position] });
    });
});

describe("resourceUses", () => {
    const changing = (key: symbol): Access => ({ components: { read: [key], write: [], mutate: [key] }, resources: { read: [], write: [], reduce: [] }, lookup: null, up: null, at: "a test" });
    it("rejects a change inside a data value, given as a copy, and takes one inside an object as a read", () => {
        expect(() => resourceUses("System \"s\"", changing(mass), undefined)).toThrow(`changes something inside its row's "resolveTest/mass", a value given as a copy`);
        expect(() => resourceUses("System \"s\"", changing(pool), undefined)).not.toThrow();
    });
});
