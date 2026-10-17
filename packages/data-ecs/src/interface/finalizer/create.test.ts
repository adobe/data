import { describe, expect, it } from "vitest";
import { Component } from "../component/component.js";
import { programFinalizers, programRules } from "../registry/index.js";
import { Resource } from "../resource/resource.js";
import { Rule } from "../rule/rule.js";
import { clock } from "../resources/index.js";
import { Finalizer } from "./finalizer.js";

const node = "typesFinalizerTest/node";
const label = "typesFinalizerTest/label";
const slot = "typesFinalizerTest/slot";
const total = "typesFinalizerTest/total";
const time = "typesFinalizerTest/time";
const mark = "typesFinalizerTest/mark";
const other = "typesFinalizerTest/other";

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
    it("record finalizers in creation order, keep a repeated one's place with its new body, and reject a different one with its name", () => {
        const release = Finalizer.create({ name: "typesFinalizerTest/release", components: { read: [node] } }, () => {});
        const save = Finalizer.changes({ name: "typesFinalizerTest/save", watch: [label] }, () => {});
        expect(programFinalizers().map(finalizer => finalizer.name)).toEqual([release.name, save.name]);
        const body = (): void => {};
        expect(Finalizer.create({ name: "typesFinalizerTest/release", components: { read: [node] } }, body)).toBe(release);
        expect(programFinalizers()[0]?.kind === "finalizer" ? programFinalizers()[0]?.body : null).toBe(body);
        expect(() => Finalizer.changes({ name: "typesFinalizerTest/release" }, () => {})).toThrow("already exists");
        expect(programFinalizers()).toHaveLength(2);
    });
    it("order finalizers by before and after, and reject a cycle or a resource conflict with no order", () => {
        const late = Finalizer.create({ name: "typesFinalizerTest/late", components: { read: [label] }, resources: { read: [time] } }, () => {});
        const early = Finalizer.create({ name: "typesFinalizerTest/early", components: { read: [label] }, resources: { write: [time] }, before: [late] }, () => {});
        expect(programFinalizers().map(finalizer => finalizer.name).filter(name => name === early.name || name === late.name)).toEqual([early.name, late.name]);
        expect(() => Finalizer.create({ name: "typesFinalizerTest/conflict", components: { read: [label] }, resources: { read: [time] } }, () => {})).toThrow('both access "typesFinalizerTest/time", one writing it');
        expect(() => Finalizer.create({ name: "typesFinalizerTest/cycle", components: { read: [label] }, before: [early], after: [late] }, () => {})).toThrow("ordered in a cycle");
        expect(() => untyped(Finalizer.create, { name: "typesFinalizerTest/clock", components: {}, resources: { write: [clock] } })).toThrow(`writes "clock", which only the world writes`);
        expect(programFinalizers()).toHaveLength(4);
    });
    it("reject what types reject, for untyped callers", () => {
        expect(() => untyped(Finalizer.create, { name: "typesFinalizerTest/both", components: {}, resources: { read: [time], write: [time] } })).toThrow("in both resources read and write");
        expect(() => untyped(Finalizer.create, { name: "typesFinalizerTest/reduced", components: {}, resources: { write: [total] } })).toThrow("which is reduced");
        expect(() => untyped(Finalizer.create, { name: "typesFinalizerTest/span", components: { read: [node, label] } })).toThrow('uses values on threads "main" and "world"');
        expect(() => untyped(Finalizer.changes, { name: "typesFinalizerTest/derived", watch: [slot] })).toThrow("which is derived");
        expect(() => untyped(Finalizer.changes, { name: "typesFinalizerTest/resource", watch: [time] })).toThrow("which isn't a registered component");
        expect(programFinalizers()).toHaveLength(4);
    });
});

describe("Rule.create", () => {
    it("records a rule, and rejects a name used twice", () => {
        Rule.create({ name: "typesFinalizerTest/slots", components: { has: [label] }, derive: [slot] });
        expect(programRules().map(rule => rule.declaration.name)).toEqual(["typesFinalizerTest/slots"]);
        expect(() => Rule.create({ name: "typesFinalizerTest/slots", components: { has: [label] }, derive: [slot] })).not.toThrow();
        expect(() => Rule.create({ name: "typesFinalizerTest/slots", components: { has: [node] }, derive: [slot] })).toThrow("already exists");
        expect(programRules()).toHaveLength(1);
    });
    it("rejects rules that derive in a cycle through a negation", () => {
        Rule.create({ name: "typesFinalizerTest/marks", components: { not: [mark] }, derive: [other] });
        expect(() => Rule.create({ name: "typesFinalizerTest/others", components: { has: [other] }, derive: [mark] })).toThrow("cycle through a negation");
        expect(programRules()).toHaveLength(2);
    });
    it("rejects a rule deriving a component that isn't derived, or matching on a resource", () => {
        const create = (declaration: object): unknown => Reflect.apply(Rule.create, undefined, [declaration]);
        expect(() => create({ name: "typesFinalizerTest/essential", components: {}, derive: [label] })).toThrow("which isn't declared derived");
        expect(() => create({ name: "typesFinalizerTest/onResource", components: { has: [time] }, derive: [slot] })).toThrow("which isn't a registered component");
        expect(programRules()).toHaveLength(2);
    });
});
