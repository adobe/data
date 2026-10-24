// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { lookupsLists, type Access } from "./resolve.js";

const mass = Symbol("resolveTest/mass");
const position = Symbol("resolveTest/position");
declare module "@adobe/ecs" {
    interface Components {
        [mass]: { type: number };
        [position]: { type: number };
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
