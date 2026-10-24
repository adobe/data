// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Finalizer } from "../finalizer/finalizer.js";
import { Rule } from "../rule/rule.js";
import { System } from "../system/system.js";
import { declareComponent$, declareResource$, declareTrait$ } from "./declare.js";
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

// The keys' ids are given by hand, after the keys are made, so they're registered here rather than declared, which
// registers a key as soon as it's made.
declareComponent$(score, { type: { type: "number" } });
declareComponent$(shown, { type: { const: true }, derived: true });
declareResource$(level, { type: { type: "number", default: 0 } });
declareComponent$(changed, { type: { type: "number" } });
declareComponent$(crossed, { type: { type: "number" } });
declareTrait$(tagged);

/** Calls a constructor as an untyped caller would, naming keys no declaration types. */
const untyped = <F extends (...parameters: never[]) => unknown>(create: F) => (...parameters: unknown[]): ReturnType<F> => Reflect.apply(create, undefined, parameters);
const system = untyped(System.create);
const rule = untyped(Rule.create);
const finalizer = untyped(Finalizer.create);
type Row = { [key: symbol]: number };

describe("keys with ids", () => {
    it("labels a key by its description, however many keys share it", () => {
        expect(labelOf(score)).toBe("score");
        declareComponent$(unnamed, { type: { type: "number" } });
        expect([labelOf(score), labelOf(unnamed)]).toEqual(["score", "score"]);
        expect(labelOf(Symbol("score"))).toBe("score");
    });
    it("accepts another symbol under a registered key's id with the same declaration, as the same key", () => {
        declareComponent$(scoreAgain, { type: { type: "number" } });
        declareComponent$(shownAgain, { type: { const: true }, derived: true });
        declareResource$(levelAgain, { type: { type: "number", default: 0 } });
        declareTrait$(taggedAgain);
        expect([kindOf(scoreAgain), kindOf(levelAgain), kindOf(taggedAgain)]).toEqual(["component", "resource", "trait"]);
        expect(declarationOf(scoreAgain)).toBe(declarationOf(score));
        expect(labelOf(scoreAgain)).toBe("score");
    });
    it("rejects another symbol under a registered key's id with another declaration, or as another kind", () => {
        expect(() => declareComponent$(changedAgain, { type: { type: "string" } })).toThrow(
            `Cannot register component "changed" (idsTest/keys.ts#changed): its id is another key's, with another declaration; if a module was evaluated again with a changed declaration, reload the page.`);
        expect(() => declareResource$(crossedAgain, { type: { type: "number", default: 0 } })).toThrow(
            `Cannot register resource "crossed" (idsTest/keys.ts#crossed): its id is a component's.`);
        expect([kindOf(changedAgain), kindOf(crossedAgain)]).toEqual([undefined, undefined]);
    });
    it("keeps keys of different ids apart, though their descriptions match", () => {
        declareComponent$(unnamed, { type: { type: "number" } });
        system(identify({ components: { write: [score] } }, "idsTest/systems.ts#unnamed"), (row: Row) => { row[score] = 1; });
        expect(() => system(identify({ components: { write: [unnamed] } }, "idsTest/systems.ts#unnamed"), (row: Row) => { row[unnamed] = 1; })).toThrow("reload the page");
    });
});

describe("declarations evaluated again", () => {
    it("accept a system whose keys match by id, as a new system", () => {
        const first = system(identify({ components: { write: [score] }, resources: { read: [level] } }, "idsTest/systems.ts#system"), (row: Row, { resources }: { resources: Row }) => { row[score] = resources[level] ?? 0; });
        const again = system(identify({ components: { write: [scoreAgain] }, resources: { read: [levelAgain] } }, "idsTest/systems.ts#system"), (row: Row, { resources }: { resources: Row }) => { row[scoreAgain] = resources[levelAgain] ?? 0; });
        expect(again).not.toBe(first);
        expect(sameItem(again, first)).toBe(true);
    });
    it("accept a rule whose keys match by id, which is already recorded", () => {
        const created = rule(identify({ components: { has: [score] }, derive: [shown] }, "idsTest/systems.ts#rule"));
        const rules = programRules().length;
        expect(rule(identify({ components: { has: [scoreAgain] }, derive: [shownAgain] }, "idsTest/systems.ts#rule"))).toBe(created);
        expect(programRules()).toHaveLength(rules);
    });
    it("accept a finalizer whose keys match by id, keeping its place with the new body", () => {
        const first = finalizer(identify({ components: { read: [score] } }, "idsTest/systems.ts#finalizer"), () => {});
        const body = (): void => {};
        expect(finalizer(identify({ components: { read: [scoreAgain] } }, "idsTest/systems.ts#finalizer"), body)).toBe(first);
        const found = programFinalizers().find(finalizer => finalizer.name === "finalizer");
        expect(found?.kind === "finalizer" ? found.body : null).toBe(body);
    });
    it("schedule symbols of one id as one key", () => {
        const write = system({ name: "write", components: { write: [score] } }, (row: Row) => { row[score] = 1; });
        const read = system({ name: "read", components: { read: [scoreAgain] } }, (row: Row) => { void row[scoreAgain]; });
        expect(() => scheduleOf(requireDefinition(system({ name: "unordered", systems: [write, read] })))).toThrow("both access");
    });
});
