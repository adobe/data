import { describe, expect, it } from "vitest";
import { declareName } from "./declare-name.js";

describe("declareName", () => {
    it("accepts a new name", () => {
        expect(() => declareName("declareName/new", "component")).not.toThrow();
    });
    it("rejects a duplicate of the same kind", () => {
        declareName("declareName/sameKind", "resource");
        expect(() => declareName("declareName/sameKind", "resource")).toThrow('already declared as a resource');
    });
    it("rejects a component and resource with the same name", () => {
        declareName("declareName/crossKind", "component");
        expect(() => declareName("declareName/crossKind", "resource")).toThrow('already declared as a component');
    });
    it("accepts a symbol with a new description", () => {
        expect(() => declareName(Symbol("declareName/symbol"), "component")).not.toThrow();
    });
    it("rejects a symbol without a description", () => {
        expect(() => declareName(Symbol(), "component")).toThrow('needs a description');
    });
    it("rejects a symbol whose description matches a declared name", () => {
        declareName("declareName/described", "component");
        expect(() => declareName(Symbol("declareName/described"), "resource")).toThrow('already declared as a component');
    });
    it("rejects two symbols with the same description", () => {
        declareName(Symbol("declareName/twin"), "component");
        expect(() => declareName(Symbol("declareName/twin"), "component")).toThrow('already declared as a component');
    });
});
