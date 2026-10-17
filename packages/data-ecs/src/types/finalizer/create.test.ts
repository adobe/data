import { describe, expect, it } from "vitest";
import { Component } from "../component/component.js";
import { programFinalizers, programRules } from "../registry/index.js";
import { Resource } from "../resource/resource.js";
import { Rule } from "../rule/rule.js";
import { Finalizer } from "./finalizer.js";

const node = "typesFinalizerTest/node";
const label = "typesFinalizerTest/label";
const slot = "typesFinalizerTest/slot";
const total = "typesFinalizerTest/total";
const time = "typesFinalizerTest/time";

declare module "@adobe/data-ecs" {
    export interface Components {
        [node]: { type: HTMLElement; thread: "main" };
        [label]: { type: string };
        [slot]: { type: number; derived: true };
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

/** Declares as an untyped caller would, bypassing the types' checks. */
const untyped = (constructor: (...parameters: never[]) => unknown, declaration: object): unknown => Reflect.apply(constructor, undefined, [declaration, () => {}]);

describe("Finalizer.create and Finalizer.changes", () => {
    it("record finalizers in creation order, and reject a name used twice", () => {
        const release = Finalizer.create({ name: "typesFinalizerTest/release", components: { read: [node] } }, () => {});
        const save = Finalizer.changes({ name: "typesFinalizerTest/save", watch: [label] }, () => {});
        expect(programFinalizers().map(finalizer => finalizer.name)).toEqual([release.name, save.name]);
        expect(() => Finalizer.changes({ name: "typesFinalizerTest/release" }, () => {})).toThrow("already exists");
    });
    it("reject what types reject, for untyped callers", () => {
        expect(() => untyped(Finalizer.create, { name: "typesFinalizerTest/both", components: {}, resources: { read: [time], write: [time] } })).toThrow("in both resources read and write");
        expect(() => untyped(Finalizer.create, { name: "typesFinalizerTest/reduced", components: {}, resources: { write: [total] } })).toThrow("which is reduced");
        expect(() => untyped(Finalizer.create, { name: "typesFinalizerTest/span", components: { read: [node, label] } })).toThrow('uses values on threads "main" and "world"');
        expect(() => untyped(Finalizer.changes, { name: "typesFinalizerTest/derived", watch: [slot] })).toThrow("which is derived");
        expect(() => untyped(Finalizer.changes, { name: "typesFinalizerTest/resource", watch: [time] })).toThrow("which isn't a registered component");
        expect(programFinalizers()).toHaveLength(2);
    });
});

describe("Rule.create", () => {
    it("records a rule, and rejects a name used twice", () => {
        Rule.create({ name: "typesFinalizerTest/slots", components: { has: [label] }, derive: [slot] });
        expect(programRules().map(rule => rule.declaration.name)).toEqual(["typesFinalizerTest/slots"]);
        expect(() => Rule.create({ name: "typesFinalizerTest/slots", components: { has: [label] }, derive: [slot] })).toThrow("already exists");
    });
    it("rejects a rule deriving a component that isn't derived, or matching on a resource", () => {
        const create = (declaration: object): unknown => Reflect.apply(Rule.create, undefined, [declaration]);
        expect(() => create({ name: "typesFinalizerTest/essential", components: {}, derive: [label] })).toThrow("which isn't declared derived");
        expect(() => create({ name: "typesFinalizerTest/onResource", components: { has: [time] }, derive: [slot] })).toThrow("which isn't a registered component");
        expect(programRules()).toHaveLength(1);
    });
});
