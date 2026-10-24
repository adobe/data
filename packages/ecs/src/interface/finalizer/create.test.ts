// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { giveAccess, identify } from "../registry/ids.test-helper.js";
import { programFinalizers, programRules } from "../registry/index.js";
import { Rule } from "../rule/rule.js";
import { clock } from "../resources/index.js";
import { Finalizer } from "./finalizer.js";

const node = Symbol("typesFinalizerTest/node");
const label = Symbol("typesFinalizerTest/label");
const slot = Symbol("typesFinalizerTest/slot");
const total = Symbol("typesFinalizerTest/total");
const time = Symbol("typesFinalizerTest/time");
const mark = Symbol("typesFinalizerTest/mark");
const other = Symbol("typesFinalizerTest/other");
const page = Symbol("typesFinalizerTest/page");
const tags = Symbol("typesFinalizerTest/tags");

declare module "@adobe/ecs" {
    export interface Components {
        [node]: { type: HTMLElement; thread: "main" };
        [label]: { type: string };
        [slot]: { type: number; derived: true };
        [mark]: { type: true; derived: true };
        [other]: { type: true; derived: true };
        [tags]: { type: readonly string[] };
    }
    export interface Resources {
        [total]: { type: number; reduce: "+" };
        [time]: { type: number };
        [page]: { type: Document | null; thread: "main" };
    }
}


/** Declares as an untyped caller would, bypassing the types' checks, its body using what `uses` says, as the build would infer. */
const untyped = (constructor: (...parameters: never[]) => unknown, declaration: object, uses: Parameters<typeof giveAccess>[1] = {}): unknown =>
    Reflect.apply(constructor, undefined, [giveAccess(declaration, uses), () => {}]);

describe("Finalizer.create and Finalizer.changes", () => {
    it("record finalizers in creation order, keep the place of one declared again under its id with its new body, and reject its id with another declaration", () => {
        const release = Finalizer.create(identify({ components: { with: [node] } }, "f.ts#release"), () => {});
        const save = Finalizer.changes({ watch: [label] }, () => {});
        expect(programFinalizers().map(finalizer => finalizer.name)).toEqual([release.name, save.name]);
        const body = (): void => {};
        // A body the build doesn't see is given what it uses.
        expect(Finalizer.create(giveAccess(identify({ components: { with: [node] } }, "f.ts#release")), body)).toBe(release);
        expect(programFinalizers()[0]?.kind === "finalizer" ? programFinalizers()[0]?.body : null).toBe(body);
        expect(() => Finalizer.create(identify({ components: { with: [label] } }, "f.ts#release"), () => {})).toThrow("reload the page");
        expect(() => Finalizer.changes(identify({}, "f.ts#release"), () => {})).toThrow("its id is a finalizer's");
        expect(programFinalizers()).toHaveLength(2);
    });
    it("keep finalizers of one label apart", () => {
        const twin = (): Finalizer => Finalizer.changes({ watch: [label] }, () => {});
        const [first, second] = [twin(), twin()];
        expect(second).not.toBe(first);
        expect([first.name, second.name]).toEqual(["twin", "twin"]);
        const third = Finalizer.changes({ watch: [label], after: [second], before: [first] }, () => {});
        expect(programFinalizers().slice(-3)).toEqual([second, third, first]);
    });
    it("order finalizers by before and after, and reject a cycle or a resource conflict with no order", () => {
        const late = Finalizer.create({ components: { with: [label] } }, (_, { resources }) => { void resources[time]; });
        const early = Finalizer.create({ components: { with: [label] }, before: [late] }, (_, { resources }) => { resources[time] = 1; });
        expect(programFinalizers().map(finalizer => finalizer.name).filter(name => name === early.name || name === late.name)).toEqual([early.name, late.name]);
        expect(() => Finalizer.create({ components: { with: [label] } }, (_, { resources }) => { void resources[time]; })).toThrow('both access "typesFinalizerTest/time", one writing it');
        expect(() => Finalizer.create({ components: { with: [label] }, before: [early], after: [late] }, () => {})).toThrow("ordered in a cycle");
        expect(() => untyped(Finalizer.create, { components: {} }, { resources: { write: [clock] } })).toThrow(`writes "clock", which only the world writes`);
        expect(programFinalizers()).toHaveLength(7);
    });
    it("reject what types reject, for untyped callers", () => {
        expect(() => untyped(Finalizer.create, { components: {} }, { resources: { write: [total] } })).toThrow("which is reduced");
        expect(() => untyped(Finalizer.create, { components: {} }, { resources: { reduce: [total] } })).toThrow("only systems contribute to a reduction");
        expect(() => untyped(Finalizer.create, { components: { with: [node, tags] } }, { read: [node, tags] })).toThrow('uses "typesFinalizerTest/node" on "main" and "typesFinalizerTest/tags" on "world"');
        expect(() => untyped(Finalizer.changes, { name: "derived", watch: [slot] })).toThrow("which is derived");
        expect(() => untyped(Finalizer.changes, { name: "resource", watch: [time] })).toThrow("which isn't a registered component");
        expect(() => untyped(Finalizer.create, { components: { with: [time] } })).toThrow(`uses component "typesFinalizerTest/time", which isn't a registered component`);
        expect(() => untyped(Finalizer.create, { components: { with: [label] }, lookup: { others: { not: [Symbol("typesFinalizerTest/unregistered")] } } }, { read: [label] })).toThrow("which isn't a registered component");
        expect(programFinalizers()).toHaveLength(7);
    });
    it("reject resource writes and lookups in a finalizer on another thread than the world's, and a changes finalizer watching or reading another thread's values", () => {
        expect(() => untyped(Finalizer.create, { components: { with: [node] } }, { read: [node], resources: { write: [time] } }))
            .toThrow(`runs on thread "main" and writes resources; one on another thread than the world's runs after the sync point, so it writes none.`);
        expect(() => untyped(Finalizer.create, { components: { with: [tags] } }, { read: [tags], resources: { write: [page] } }))
            .toThrow('uses "typesFinalizerTest/tags" on "world" and "typesFinalizerTest/page" on "main"');
        expect(() => untyped(Finalizer.create, { components: { with: [node] }, lookup: { labels: { with: [mark] } } }, { read: [node], lookup: { labels: [mark] } }))
            .toThrow(`runs on thread "main" and looks up other entities; one on another thread than the world's runs after the sync point, so it looks up none.`);
        expect(() => untyped(Finalizer.changes, { name: "saveNodes", watch: [node] }))
            .toThrow(`watches or reads values on thread "main"; a changes finalizer runs on the world's thread, in the sync point.`);
        expect(() => untyped(Finalizer.changes, { watch: [tags] }, { resources: { read: [page] } }))
            .toThrow('uses "typesFinalizerTest/tags" on "world" and "typesFinalizerTest/page" on "main"');
        expect(() => untyped(Finalizer.changes, {}, { resources: { read: [page] } }))
            .toThrow(`watches or reads values on thread "main"; a changes finalizer runs on the world's thread, in the sync point.`);
        // Reading another thread's values, without writing or looking up, it's created.
        const detach = Finalizer.create({ components: { with: [node] } }, row => { void row[node]; });
        expect(programFinalizers()).toHaveLength(8);
        // Finalizers on different threads run at different times, so neither is ordered before the other.
        const late = programFinalizers().find(finalizer => finalizer.name === "late");
        expect(() => untyped(Finalizer.create, { components: { with: [label] }, after: [detach] }, { read: [label] }))
            .toThrow(`runs on thread "world" and is ordered with "detach", which runs on thread "main"; finalizers on different threads run at different times, so neither is ordered before the other.`);
        expect(() => untyped(Finalizer.create, { components: { with: [node] }, before: [late] }, { read: [node] }))
            .toThrow(`runs on thread "main" and is ordered with "late", which runs on thread "world"`);
        expect(() => untyped(Finalizer.changes, { name: "saveAfterDetach", watch: [label], after: [detach] }))
            .toThrow(`runs on thread "world" and is ordered with "detach"`);
        Finalizer.create({ components: { with: [node] }, after: [detach] }, row => { void row[node]; });
        expect(programFinalizers()).toHaveLength(9);
    });
});

describe("Rule.create", () => {
    it("records a rule and returns it, the one already recorded when declared again under its id, and rejects its id with another declaration", () => {
        const slots = Rule.create(identify({ components: { with: [label] }, derive: [slot] }, "r.ts#slots"));
        expect(programRules()).toEqual([slots]);
        expect(Rule.create(identify({ components: { with: [label] }, derive: [slot] }, "r.ts#slots"))).toBe(slots);
        expect(() => Rule.create(identify({ components: { with: [node] }, derive: [slot] }, "r.ts#slots"))).toThrow("reload the page");
        const twin = Rule.create({ components: { with: [node] }, derive: [slot] });
        expect(programRules()).toEqual([slots, twin]);
        expect([slots, twin].map(rule => rule.name)).toEqual(["slots", "twin"]);
    });
    it("rejects rules that derive in a cycle through a negation", () => {
        Rule.create({ components: { not: [mark] }, derive: [other] });
        expect(() => Rule.create({ components: { with: [other] }, derive: [mark] })).toThrow("cycle through a negation");
        expect(programRules()).toHaveLength(3);
    });
    it("rejects a rule deriving a component that isn't derived, or matching on a resource", () => {
        const create = (declaration: object): unknown => Reflect.apply(Rule.create, undefined, [declaration]);
        expect(() => create({ components: {}, derive: [label] })).toThrow("which isn't declared derived");
        expect(() => create({ components: { with: [time] }, derive: [slot] })).toThrow("which isn't a registered component");
        expect(programRules()).toHaveLength(3);
    });
});

describe("rules' and finalizers' labels", () => {
    it("are the bindings of their ids, or else their kinds numbered", () => {
        const [rule, release] = [Rule.create(identify({ components: { with: [node] }, derive: [slot] }, "rules.ts#slotted")), Finalizer.create(identify({ components: { with: [node] } }, "finalizers.ts#release"), () => {})];
        expect([rule?.name, release?.name]).toEqual(["slotted", "release"]);
        // Made in an expression no binding names, so the build labels them by nothing.
        const [rule2, finalizer2] = [Rule.create({ components: { with: [label] }, derive: [slot] }), Finalizer.changes({ watch: [label] }, () => {})];
        expect([rule2, finalizer2].map(item => item.name.replace(/#\d+$/, "#n"))).toEqual(["rule #n", "finalizer #n"]);
    });
});
