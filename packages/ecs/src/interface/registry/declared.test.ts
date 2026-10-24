// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { identify, recordDeclaration } from "./ids.test-helper.js";
import "./declarations.js";
import { declarationOf, kindOf, sameKey, whyUnregistered } from "./names.js";

describe("declarations the build records", () => {
    it("registers a key at its first use, as its kind says", () => {
        const speed = Symbol("declaredTest/speed");
        const tag = Symbol("declaredTest/tag");
        recordDeclaration(speed, "resource", { type: { type: "number", default: 1 } });
        recordDeclaration(tag, "trait");
        expect([kindOf(speed), kindOf(tag)]).toEqual(["resource", "trait"]);
        expect(declarationOf(speed)).toEqual({ type: { type: "number", default: 1 } });
    });
    it("registers in the order modules recorded them, so a trait comes before what declares it", () => {
        const mark = Symbol("declaredTest/mark");
        const marked = Symbol("declaredTest/marked");
        recordDeclaration(mark, "trait");
        recordDeclaration(marked, "component", { type: { const: true }, [mark]: true });
        expect(kindOf(marked)).toBe("component");
    });
    it("takes another symbol of one id, as a module evaluated again records it, as the same key", () => {
        const first = identify(Symbol("declaredTest/again"), "declaredTest/keys.ts#again");
        const again = identify(Symbol("declaredTest/again"), "declaredTest/keys.ts#again");
        recordDeclaration(first, "component", { type: { type: "number" } });
        recordDeclaration(again, "component", { type: { type: "number" } });
        expect([kindOf(again), sameKey(first, again)]).toEqual(["component", true]);
    });
    it("never throws a declaration that fails for another key's use, and gives it as the reason its own key's uses fail", () => {
        const late = Symbol("declaredTest/late");
        const fine = Symbol("declaredTest/fine");
        recordDeclaration(late, "component", { type: { type: "number" }, reduce: "+" });
        recordDeclaration(fine, "component", { type: { type: "number" } });
        expect([kindOf(fine), kindOf(late)]).toEqual(["component", undefined]);
        expect(whyUnregistered(late)).toBe(`its declaration failed to register: Cannot register component "declaredTest/late": only a resource is reduced.`);
        // Left valid, so any other copy of the registry reading the map later registers it.
        recordDeclaration(late, "component", { type: { type: "number" } });
    });
});
