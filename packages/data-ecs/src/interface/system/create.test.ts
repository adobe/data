import { describe, expect, it } from "vitest";
import { Component } from "../component/component.js";
import { definitionOf, itemNamed, requireDefinition, scheduleOf, threadOf } from "../registry/index.js";
import { Resource } from "../resource/resource.js";
import { clock, gpuDevice, report } from "../resources/index.js";
import { System } from "./system.js";

const position = Symbol("typesSystemTest/position");
const label = Symbol("typesSystemTest/label");
const node = Symbol("typesSystemTest/node");
const document = Symbol("typesSystemTest/document");
const time = Symbol("typesSystemTest/time");
const unregistered = Symbol("typesSystemTest/unregistered");

declare module "@adobe/data-ecs" {
    export interface Components {
        [position]: { type: number };
        [label]: { type: string };
        [node]: { type: HTMLElement; thread: "main" };
        [unregistered]: { type: number };
    }
    export interface Resources {
        [document]: { type: Document | null; thread: "main" };
        [time]: { type: number };
    }
}

Component.register(position, { type: { type: "number" } });
Component.register(label, { type: { type: "string" } });
Component.register(node, { thread: "main" });
Resource.register(document, { thread: "main" });
Resource.register(time, { type: { type: "number", default: 0 } });

/** Creates as an untyped caller would, bypassing the types' checks. */
const create = (declaration: object): unknown => Reflect.apply(System.create, undefined, [declaration, () => {}]);

describe("System.create", () => {
    it("records the system by name, its value holding its declaration and body", () => {
        const body = (): void => {};
        const move = System.create({ name: "typesSystemTest/move", components: { write: [position] }, resources: { read: [time] } }, body);
        expect(definitionOf(move)).toEqual({ kind: "system", name: "typesSystemTest/move", declaration: { name: "typesSystemTest/move", components: { write: [position] }, resources: { read: [time] } }, body });
        expect(itemNamed("typesSystemTest/move")).toBe(move);
        expect(definitionOf({ name: "typesSystemTest/move" })).toBe(undefined);
    });
    it("accepts the same declaration again as a new system, as a module evaluated again makes it, and rejects a different one", () => {
        const first = System.create({ name: "typesSystemTest/twice", components: { read: [position] } }, row => { void row[position]; });
        const again = System.create({ name: "typesSystemTest/twice", components: { read: [position] } }, row => { void row[position]; });
        expect(again).not.toBe(first);
        expect(itemNamed("typesSystemTest/twice")).toBe(again);
        expect(definitionOf(first)).toBe(first);
        expect(() => System.create({ name: "typesSystemTest/twice", components: { write: [position] } }, row => { row[position] = 0; })).toThrow('A different system, rule or finalizer named "typesSystemTest/twice" already exists');
        expect(itemNamed("typesSystemTest/twice")).toBe(again);
    });
    it("rejects writing what only the world writes, for untyped callers", () => {
        expect(() => create({ name: "typesSystemTest/clock", resources: { write: [clock] } })).toThrow(`writes "clock", which only the world writes`);
        expect(() => create({ name: "typesSystemTest/report", resources: { write: [report] } })).toThrow(`writes "report", which only the world writes`);
    });
    it("rejects what types reject, for untyped callers", () => {
        expect(() => create({ name: "typesSystemTest/both", components: { read: [position], write: [position] } })).toThrow("in both components read and write");
        expect(() => create({ name: "typesSystemTest/bothResources", resources: { read: [time], write: [time] } })).toThrow("in both resources read and write");
        expect(() => create({ name: "typesSystemTest/lookup", components: { write: [position] }, lookup: { others: { read: [position] } } })).toThrow('lookup "others" reads "typesSystemTest/position", which the system writes');
        expect(() => create({ name: "typesSystemTest/input", input: { type: "number" } })).toThrow("input is an object schema of named fields");
        expect(itemNamed("typesSystemTest/both")).toBe(undefined);
    });
    it("derives its thread from its object components and resources, and rejects two", () => {
        const show = System.create({ name: "typesSystemTest/show", components: { read: [position, node] }, resources: { read: [time, document] } }, (row, { resources }) => { row[node].textContent = `${row[position]} ${resources[time]} ${resources[document]?.title}`; });
        const count = System.create({ name: "typesSystemTest/count", components: { read: [label], has: [node] } }, row => { void row[label]; });
        const tick = System.create({ name: "typesSystemTest/tick", components: { write: [position] } }, row => { row[position] += 1; });
        const leaves = [show, count, tick].map(system => definitionOf(system));
        expect(leaves.map(leaf => leaf === undefined || leaf.kind === "composite" ? undefined : threadOf(leaf.declaration, "System"))).toEqual(["main", "world", null]);
        expect(() => create({ name: "typesSystemTest/span", components: { read: [label], write: [node] } })).toThrow('System "typesSystemTest/span" uses values on threads "world" and "main"');
        expect(() => create({ name: "typesSystemTest/spanResource", components: { read: [label] }, resources: { is: [document] } })).toThrow('uses values on threads "world" and "main"');
        expect(() => create({ name: "typesSystemTest/unregistered", components: { read: [unregistered] } })).toThrow(`uses component "typesSystemTest/unregistered", which isn't a registered component`);
        expect(() => create({ name: "typesSystemTest/wrongKind", components: { read: [time] } })).toThrow(`uses component "typesSystemTest/time", which isn't a registered component`);
    });
});

describe("System.composite", () => {
    it("records a composite whose members may live on different threads", () => {
        const show = System.create({ name: "typesSystemTest/showMember", components: { read: [node] } }, row => { row[node].hidden = true; });
        const name = System.create({ name: "typesSystemTest/nameMember", components: { write: [label] } }, row => { row[label] = ""; });
        const frame = System.composite({ name: "typesSystemTest/frame", systems: [show, name] });
        expect(definitionOf(frame)?.kind).toBe("composite");
        expect(() => System.composite({ name: "typesSystemTest/frame", systems: [show] })).toThrow("already exists");
    });
    it("rejects members ordered in a cycle, and conflicting members with no order between them", () => {
        const first = System.create({ name: "typesSystemTest/first", components: { write: [position] } }, row => { row[position] += 1; });
        const second = System.create({ name: "typesSystemTest/second", components: { read: [position] }, after: [first] }, row => { void row[position]; });
        const third = System.create({ name: "typesSystemTest/third", components: { read: [position] } }, row => { void row[position]; });
        expect(scheduleOf(requireDefinition(System.composite({ name: "typesSystemTest/ordered", systems: [second, first] }))).tiers.map(tier => tier.map(leaf => leaf.name))).toEqual([["typesSystemTest/first"], ["typesSystemTest/second"]]);
        expect(() => System.composite({ name: "typesSystemTest/unordered", systems: [first, third] })).toThrow('Systems "typesSystemTest/first" and "typesSystemTest/third" both access "typesSystemTest/position" and one writes it');
        const looped = System.create({ name: "typesSystemTest/looped", before: [first], after: [second] }, () => {});
        expect(() => System.composite({ name: "typesSystemTest/cycle", systems: [first, second, looped] })).toThrow("Ordering cycle");
        expect(itemNamed("typesSystemTest/unordered")).toBe(undefined);
    });
    it("rejects a member no constructor returned, and an input field two members declare differently", () => {
        expect(() => System.composite({ name: "typesSystemTest/forged", systems: [{ name: "typesSystemTest/showMember" }] })).toThrow('member "typesSystemTest/showMember" isn\'t a system a System constructor returned');
        const move = System.create({ name: "typesSystemTest/moveBy", input: { type: "object", properties: { distance: { type: "number" } } } }, () => {});
        const tag = System.create({ name: "typesSystemTest/tagBy", input: { type: "object", properties: { distance: { type: "string" } } } }, () => {});
        const nested = System.composite({ name: "typesSystemTest/nested", systems: [tag] });
        const composite: (declaration: object) => unknown = declaration => Reflect.apply(System.composite, undefined, [declaration]);
        expect(() => composite({ name: "typesSystemTest/conflict", systems: [move, nested] })).toThrow('Systems "typesSystemTest/moveBy" and "typesSystemTest/tagBy" declare input field "distance" with different schemas.');
        expect(itemNamed("typesSystemTest/conflict")).toBe(undefined);
    });
});

describe("System.render", () => {
    it("reads the components its accessors name, once each, and runs only while gpuDevice is set", () => {
        const draw = System.render({ name: "typesSystemTest/draw", shader: { accessors: { place: position, again: position } } }, () => {});
        const definition = definitionOf(draw);
        expect(definition?.kind === "render" ? [definition.declaration.components, definition.declaration.resources] : null).toEqual([{ read: [position] }, { is: [gpuDevice] }]);
        const render: (declaration: object) => unknown = declaration => Reflect.apply(System.render, undefined, [declaration, () => {}]);
        expect(() => render({ name: "typesSystemTest/drawDocument", resources: { read: [document] }, shader: { accessors: {} } })).toThrow('uses values on threads "main" and "world"');
    });
});
