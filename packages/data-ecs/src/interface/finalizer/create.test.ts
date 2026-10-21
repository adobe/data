import { describe, expect, it } from "vitest";
import { Component } from "../component/component.js";
import { identify } from "../registry/ids.test-helper.js";
import { labelOfItem, programFinalizers, programRules } from "../registry/index.js";
import { Resource } from "../resource/resource.js";
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

declare module "@adobe/data-ecs" {
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

Component.register(node, { thread: "main" });
Component.register(label, { type: { type: "string" } });
Component.register(tags, { type: { type: "array", items: { type: "string" } } });
Component.register(slot, { type: { type: "number", default: 0 }, derived: true });
Resource.register(total, { type: { type: "number", default: 0 }, reduce: "+" });
Resource.register(time, { type: { type: "number", default: 0 } });
Resource.register(page, { thread: "main" });
Component.register(mark, { type: { const: true }, derived: true });
Component.register(other, { type: { const: true }, derived: true });

/** Declares as an untyped caller would, bypassing the types' checks. */
const untyped = (constructor: (...parameters: never[]) => unknown, declaration: object): unknown => Reflect.apply(constructor, undefined, [declaration, () => {}]);

describe("Finalizer.create and Finalizer.changes", () => {
    it("record finalizers in creation order, keep the place of one declared again under its id with its new body, and reject its id with another declaration", () => {
        const release = Finalizer.create(identify({ name: "typesFinalizerTest/release", components: { read: [node] } }, "f.ts#release"), () => {});
        const save = Finalizer.changes({ name: "typesFinalizerTest/save", watch: [label] }, () => {});
        expect(programFinalizers().map(finalizer => finalizer.name)).toEqual([release.name, save.name]);
        const body = (): void => {};
        expect(Finalizer.create(identify({ name: "typesFinalizerTest/release", components: { read: [node] } }, "f.ts#release"), body)).toBe(release);
        expect(programFinalizers()[0]?.kind === "finalizer" ? programFinalizers()[0]?.body : null).toBe(body);
        expect(() => Finalizer.create(identify({ name: "typesFinalizerTest/release", components: { read: [label] } }, "f.ts#release"), () => {})).toThrow("reload the page");
        expect(() => Finalizer.changes(identify({ name: "typesFinalizerTest/release" }, "f.ts#release"), () => {})).toThrow("its id is a finalizer's");
        expect(programFinalizers()).toHaveLength(2);
    });
    it("keep finalizers of one name apart, labeled apart", () => {
        const first = Finalizer.changes({ name: "typesFinalizerTest/twin", watch: [label] }, () => {});
        const second = Finalizer.changes({ name: "typesFinalizerTest/twin", watch: [label] }, () => {});
        expect(second).not.toBe(first);
        expect([first, second].map(labelOfItem)).toEqual(["typesFinalizerTest/twin", "typesFinalizerTest/twin#2"]);
        const third = Finalizer.changes({ name: "typesFinalizerTest/ordered", watch: [label], after: [second], before: [first] }, () => {});
        expect(programFinalizers().slice(-3)).toEqual([second, third, first]);
    });
    it("order finalizers by before and after, and reject a cycle or a resource conflict with no order", () => {
        const late = Finalizer.create({ name: "typesFinalizerTest/late", components: { read: [label] }, resources: { read: [time] } }, () => {});
        const early = Finalizer.create({ name: "typesFinalizerTest/early", components: { read: [label] }, resources: { write: [time] }, before: [late] }, () => {});
        expect(programFinalizers().map(finalizer => finalizer.name).filter(name => name === early.name || name === late.name)).toEqual([early.name, late.name]);
        expect(() => Finalizer.create({ name: "typesFinalizerTest/conflict", components: { read: [label] }, resources: { read: [time] } }, () => {})).toThrow('both access "typesFinalizerTest/time", one writing it');
        expect(() => Finalizer.create({ name: "typesFinalizerTest/cycle", components: { read: [label] }, before: [early], after: [late] }, () => {})).toThrow("ordered in a cycle");
        expect(() => untyped(Finalizer.create, { name: "typesFinalizerTest/clock", components: {}, resources: { write: [clock] } })).toThrow(`writes "clock", which only the world writes`);
        expect(programFinalizers()).toHaveLength(7);
    });
    it("reject what types reject, for untyped callers", () => {
        expect(() => untyped(Finalizer.create, { name: "typesFinalizerTest/both", components: {}, resources: { read: [time], write: [time] } })).toThrow("in both resources read and write");
        expect(() => untyped(Finalizer.create, { name: "typesFinalizerTest/reduced", components: {}, resources: { write: [total] } })).toThrow("which is reduced");
        expect(() => untyped(Finalizer.create, { name: "typesFinalizerTest/span", components: { read: [node, tags] } })).toThrow('uses values on threads "main" and "world"');
        expect(() => untyped(Finalizer.changes, { name: "typesFinalizerTest/derived", watch: [slot] })).toThrow("which is derived");
        expect(() => untyped(Finalizer.changes, { name: "typesFinalizerTest/resource", watch: [time] })).toThrow("which isn't a registered component");
        expect(() => untyped(Finalizer.create, { name: "typesFinalizerTest/hasResource", components: { has: [time] } })).toThrow(`Finalizer "typesFinalizerTest/hasResource" uses component "typesFinalizerTest/time", which isn't a registered component`);
        expect(() => untyped(Finalizer.create, { name: "typesFinalizerTest/lookupNot", components: { read: [label] }, lookup: { others: { not: [Symbol("typesFinalizerTest/unregistered")] } } })).toThrow("which isn't a registered component");
        expect(programFinalizers()).toHaveLength(7);
    });
    it("reject resource writes and lookups in a finalizer on another thread than the world's, and a changes finalizer watching or reading another thread's values", () => {
        expect(() => untyped(Finalizer.create, { name: "typesFinalizerTest/detachWriting", components: { read: [node] }, resources: { write: [time] } }))
            .toThrow(`Finalizer "typesFinalizerTest/detachWriting" runs on thread "main" and writes resources; one on another thread than the world's runs after the sync point, so it writes none.`);
        expect(() => untyped(Finalizer.create, { name: "typesFinalizerTest/pageWriting", components: { read: [tags] }, resources: { write: [page] } }))
            .toThrow('uses values on threads "world" and "main"');
        expect(() => untyped(Finalizer.create, { name: "typesFinalizerTest/detachLooking", components: { read: [node] }, lookup: { labels: { read: [mark] } } }))
            .toThrow(`Finalizer "typesFinalizerTest/detachLooking" runs on thread "main" and looks up other entities; one on another thread than the world's runs after the sync point, so it looks up none.`);
        expect(() => untyped(Finalizer.changes, { name: "typesFinalizerTest/saveNodes", watch: [node] }))
            .toThrow(`Finalizer "typesFinalizerTest/saveNodes" watches or reads values on thread "main"; a changes finalizer runs on the world's thread, in the sync point.`);
        expect(() => untyped(Finalizer.changes, { name: "typesFinalizerTest/savePage", watch: [tags], resources: { read: [page] } }))
            .toThrow('uses values on threads "world" and "main"');
        expect(() => untyped(Finalizer.changes, { name: "typesFinalizerTest/savePageOnly", resources: { read: [page] } }))
            .toThrow(`Finalizer "typesFinalizerTest/savePageOnly" watches or reads values on thread "main"; a changes finalizer runs on the world's thread, in the sync point.`);
        // Reading another thread's values, without writing or looking up, it's created.
        const detach = Finalizer.create({ name: "typesFinalizerTest/detach", components: { read: [node] }, resources: { read: [page] } }, () => {});
        expect(programFinalizers()).toHaveLength(8);
        // Finalizers on different threads run at different times, so neither is ordered before the other.
        const late = programFinalizers().find(finalizer => finalizer.name === "typesFinalizerTest/late");
        expect(() => untyped(Finalizer.create, { name: "typesFinalizerTest/afterDetach", components: { read: [label] }, after: [detach] }))
            .toThrow(`Finalizer "typesFinalizerTest/afterDetach" runs on thread "world" and is ordered with "typesFinalizerTest/detach", which runs on thread "main"; finalizers on different threads run at different times, so neither is ordered before the other.`);
        expect(() => untyped(Finalizer.create, { name: "typesFinalizerTest/beforeLate", components: { read: [node] }, before: [late] }))
            .toThrow(`Finalizer "typesFinalizerTest/beforeLate" runs on thread "main" and is ordered with "typesFinalizerTest/late", which runs on thread "world"`);
        expect(() => untyped(Finalizer.changes, { name: "typesFinalizerTest/saveAfterDetach", watch: [label], after: [detach] }))
            .toThrow(`Finalizer "typesFinalizerTest/saveAfterDetach" runs on thread "world" and is ordered with "typesFinalizerTest/detach"`);
        Finalizer.create({ name: "typesFinalizerTest/detachAgain", components: { read: [node] }, after: [detach] }, () => {});
        expect(programFinalizers()).toHaveLength(9);
    });
});

describe("Rule.create", () => {
    it("records a rule and returns it, the one already recorded when declared again under its id, and rejects its id with another declaration", () => {
        const slots = Rule.create(identify({ name: "typesFinalizerTest/slots", components: { has: [label] }, derive: [slot] }, "r.ts#slots"));
        expect(programRules()).toEqual([slots]);
        expect(Rule.create(identify({ name: "typesFinalizerTest/slots", components: { has: [label] }, derive: [slot] }, "r.ts#slots"))).toBe(slots);
        expect(() => Rule.create(identify({ name: "typesFinalizerTest/slots", components: { has: [node] }, derive: [slot] }, "r.ts#slots"))).toThrow("reload the page");
        const twin = Rule.create({ name: "typesFinalizerTest/slots", components: { has: [node] }, derive: [slot] });
        expect(programRules()).toEqual([slots, twin]);
        expect([slots, twin].map(labelOfItem)).toEqual(["typesFinalizerTest/slots (r.ts#slots)", "typesFinalizerTest/slots#2"]);
    });
    it("rejects rules that derive in a cycle through a negation", () => {
        Rule.create({ name: "typesFinalizerTest/marks", components: { not: [mark] }, derive: [other] });
        expect(() => Rule.create({ name: "typesFinalizerTest/others", components: { has: [other] }, derive: [mark] })).toThrow("cycle through a negation");
        expect(programRules()).toHaveLength(3);
    });
    it("rejects a rule deriving a component that isn't derived, or matching on a resource", () => {
        const create = (declaration: object): unknown => Reflect.apply(Rule.create, undefined, [declaration]);
        expect(() => create({ name: "typesFinalizerTest/essential", components: {}, derive: [label] })).toThrow("which isn't declared derived");
        expect(() => create({ name: "typesFinalizerTest/onResource", components: { has: [time] }, derive: [slot] })).toThrow("which isn't a registered component");
        expect(programRules()).toHaveLength(3);
    });
});

describe("rules and finalizers without a name", () => {
    it("are named by their binding and id, or else by their kind numbered", () => {
        const rule = Rule.create(identify({ components: { has: [node] }, derive: [slot] }, "rules.ts#slotted"));
        const release = Finalizer.create(identify({ components: { read: [node] } }, "finalizers.ts#release"), () => {});
        expect([rule, release].map(labelOfItem)).toEqual(["slotted (rules.ts#slotted)", "release (finalizers.ts#release)"]);
        const labels = [Rule.create({ components: { has: [label] }, derive: [slot] }), Finalizer.changes({ watch: [label] }, () => {})].map(labelOfItem);
        expect(labels.map(found => found.replace(/#\d+$/, "#n"))).toEqual(["rule #n", "finalizer #n"]);
    });
});
