// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Finalizer } from "../finalizer/finalizer.js";
import { Rule } from "../rule/rule.js";
import { System } from "../system/system.js";
import { declareComponent, declareResource, declareTrait } from "./declare.js";
import { identify } from "./ids.test-helper.js";
import { declarationOf, kindOf, labelOf, programFinalizers, programRules, requireDefinition, sameItem, scheduleOf } from "./index.js";

// Each pair is one module's key and the key that module makes when evaluated again: one id, two symbols.
const score = Symbol("score");
const scoreAgain = Symbol("score");
const shown = Symbol("shown");
const shownAgain = Symbol("shown");
const level = Symbol("level");
const levelAgain = Symbol("level");
const changed = Symbol("changed");
const changedAgain = Symbol("changed");
const crossed = Symbol("crossed");
const crossedAgain = Symbol("crossed");
const unnamed = Symbol("score");
identify(unnamed, "idsTest/other.ts#score");
const tagged = Symbol("tagged");
const taggedAgain = Symbol("tagged");

identify(score, "idsTest/keys.ts#score");
identify(scoreAgain, "idsTest/keys.ts#score");
identify(shown, "idsTest/keys.ts#shown");
identify(shownAgain, "idsTest/keys.ts#shown");
identify(level, "idsTest/keys.ts#level");
identify(levelAgain, "idsTest/keys.ts#level");
identify(changed, "idsTest/keys.ts#changed");
identify(changedAgain, "idsTest/keys.ts#changed");
identify(crossed, "idsTest/keys.ts#crossed");
identify(crossedAgain, "idsTest/keys.ts#crossed");
identify(tagged, "idsTest/keys.ts#tagged");
identify(taggedAgain, "idsTest/keys.ts#tagged");

declare module "@adobe/ecs" {
    export interface Components {
        [score]: { type: number };
        [scoreAgain]: { type: number };
        [shown]: { type: true; derived: true };
        [shownAgain]: { type: true; derived: true };
        [changed]: { type: number };
        [crossed]: { type: number };
    }
    export interface Resources {
        [level]: { type: number; default: 0 };
        [levelAgain]: { type: number; default: 0 };
    }
    export interface Traits<N> {
        readonly [tagged]: true;
        readonly [taggedAgain]: true;
    }
}

// Keys registered late, or wrongly, aren't declared, so the build doesn't register them.
/** Creates a system naming keys no declaration types. */
const untypedSystem = (declaration: object, body: (row: { [key: symbol]: number }) => void): unknown => Reflect.apply(System.create, undefined, [declaration, body]);

describe("keys with ids", () => {
    it("labels a key by its description, and by its id once another registered key has its description", () => {
        expect(labelOf(score)).toBe("score");
        declareComponent(unnamed, { type: { type: "number" } });
        expect([labelOf(score), labelOf(unnamed)]).toEqual(["idsTest/keys.ts#score", "idsTest/other.ts#score"]);
        expect(labelOf(Symbol("score"))).toBe("score");
    });
    it("accepts another symbol under a registered key's id with the same declaration, as the same key", () => {
        declareComponent(scoreAgain, { type: { type: "number" } });
        declareComponent(shownAgain, { type: { const: true }, derived: true });
        declareResource(levelAgain, { type: { type: "number", default: 0 } });
        declareTrait(taggedAgain);
        expect([kindOf(scoreAgain), kindOf(levelAgain), kindOf(taggedAgain)]).toEqual(["component", "resource", "trait"]);
        expect(declarationOf(scoreAgain)).toBe(declarationOf(score));
        expect(labelOf(scoreAgain)).toBe("idsTest/keys.ts#score");
    });
    it("rejects another symbol under a registered key's id with another declaration, or as another kind", () => {
        expect(() => declareComponent(changedAgain, { type: { type: "string" } })).toThrow(
            `Cannot register component "idsTest/keys.ts#changed": its id is another key's, with another declaration; if a module was evaluated again with a changed declaration, reload the page.`);
        expect(() => declareResource(crossedAgain, { type: { type: "number", default: 0 } })).toThrow(
            `Cannot register resource "idsTest/keys.ts#crossed": its id is a component's.`);
        expect([kindOf(changedAgain), kindOf(crossedAgain)]).toEqual([undefined, undefined]);
    });
    it("keeps keys of different ids apart, though their descriptions match", () => {
        declareComponent(unnamed, { type: { type: "number" } });
        System.create(identify({ name: "idsTest/unnamed", components: { write: [score] } }, "idsTest/systems.ts#unnamed"), row => { row[score] = 1; });
        expect(() => untypedSystem(identify({ name: "idsTest/unnamed", components: { write: [unnamed] } }, "idsTest/systems.ts#unnamed"), row => { row[unnamed] = 1; })).toThrow("reload the page");
    });
});

describe("declarations evaluated again", () => {
    it("accept a system whose keys match by id, as a new system", () => {
        const first = System.create(identify({ name: "idsTest/system", components: { write: [score] }, resources: { read: [level] } }, "idsTest/systems.ts#system"), (row, { resources }) => { row[score] = resources[level]; });
        const again = System.create(identify({ name: "idsTest/system", components: { write: [scoreAgain] }, resources: { read: [levelAgain] } }, "idsTest/systems.ts#system"), (row, { resources }) => { row[scoreAgain] = resources[levelAgain]; });
        expect(again).not.toBe(first);
        expect(sameItem(again, first)).toBe(true);
    });
    it("accept a rule whose keys match by id, which is already recorded", () => {
        const rule = Rule.create(identify({ name: "idsTest/rule", components: { has: [score] }, derive: [shown] }, "idsTest/systems.ts#rule"));
        const rules = programRules().length;
        expect(Rule.create(identify({ name: "idsTest/rule", components: { has: [scoreAgain] }, derive: [shownAgain] }, "idsTest/systems.ts#rule"))).toBe(rule);
        expect(programRules()).toHaveLength(rules);
    });
    it("accept a finalizer whose keys match by id, keeping its place with the new body", () => {
        const first = Finalizer.create(identify({ name: "idsTest/finalizer", components: { read: [score] } }, "idsTest/systems.ts#finalizer"), () => {});
        const body = (): void => {};
        expect(Finalizer.create(identify({ name: "idsTest/finalizer", components: { read: [scoreAgain] } }, "idsTest/systems.ts#finalizer"), body)).toBe(first);
        const found = programFinalizers().find(finalizer => finalizer.name === "idsTest/finalizer");
        expect(found?.kind === "finalizer" ? found.body : null).toBe(body);
    });
    it("schedule symbols of one id as one key", () => {
        const write = System.create({ name: "idsTest/write", components: { write: [score] } }, row => { row[score] = 1; });
        const read = System.create({ name: "idsTest/read", components: { read: [scoreAgain] } }, row => { void row[scoreAgain]; });
        expect(() => scheduleOf(requireDefinition(System.create({ name: "idsTest/unordered", systems: [write, read] })))).toThrow("both access");
    });
});
