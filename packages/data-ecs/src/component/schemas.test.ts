import { describe, expect, it } from "vitest";
import "../components/index.js";
import { Component } from "./component.js";

describe("Component.register", () => {
    it("registers the schema", () => {
        expect(Component.schemas.persistent).toEqual({ const: true });
    });
    it("rejects a duplicate name", () => {
        expect(() => Component.register("persistent", { const: true })).toThrow('already declared as a component');
    });
});
