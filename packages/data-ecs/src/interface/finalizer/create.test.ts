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

declare module "@adobe/data-ecs" {
    export interface Components {
        [node]: { type: HTMLElement; thread: "main" };
        [label]: { type: string };
        [slot]: { type: number; derived: true };
        [mark]: { type: true; derived: true };
        [other]: { type: true; derived: true };
    }
    export interface Resources {
        [total]: { type: number; reduce: "+" };
        [time]: { type: number };
    }
}

Component.register(node, { thread: "main" });
Component.register(label, { type: { type: "string" } });
Component.register(slot, { type: { type: "number", default: 0 }, derived: true });
Resource.register(total, { type: { type: "number", default: 0 }, reduce: "+" });
Resource.register(time, { type: { type: "number", default: 0 } });
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
        expect(() => untyped(Finalizer.create, { name: "typesFinalizerTest/span", components: { read: [node, label] } })).toThrow('uses values on threads "main" and "world"');
        expect(() => untyped(Finalizer.changes, { name: "typesFinalizerTest/derived", watch: [slot] })).toThrow("which is derived");
        expect(() => untyped(Finalizer.changes, { name: "typesFinalizerTest/resource", watch: [time] })).toThrow("which isn't a registered component");
        expect(() => untyped(Finalizer.create, { name: "typesFinalizerTest/hasResource", components: { has: [time] } })).toThrow(`Finalizer "typesFinalizerTest/hasResource" uses component "typesFinalizerTest/time", which isn't a registered component`);
        expect(() => untyped(Finalizer.create, { name: "typesFinalizerTest/lookupNot", components: { read: [label] }, lookup: { others: { not: [Symbol("typesFinalizerTest/unregistered")] } } })).toThrow("which isn't a registered component");
        expect(programFinalizers()).toHaveLength(7);
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
