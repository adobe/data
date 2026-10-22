// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Component } from "../component/component.js";
import { Entity } from "../entity/entity.js";
import { Finalizer } from "../finalizer/finalizer.js";
import { identify } from "../registry/ids.test-helper.js";
import { isLeaf, labelOfItem, requireDefinition } from "../registry/index.js";
import { accessOf } from "../registry/schedule.js";
import { threadOf } from "../registry/threads.js";
import { System } from "../system/system.js";
import { Index } from "./index-type.js";

const cell = Symbol("indexCreateTest/cell");
const point = Symbol("indexCreateTest/point");
const amount = Symbol("indexCreateTest/amount");
const name = Symbol("indexCreateTest/name");
const node = Symbol("indexCreateTest/node");
const tags = Symbol("indexCreateTest/tags");
const shown = Symbol("indexCreateTest/shown");
const parent = Symbol("indexCreateTest/parent");
const unregistered = Symbol("indexCreateTest/unregistered");
const handle = Symbol("indexCreateTest/handle");
const view = Symbol("indexCreateTest/view");

declare module "@adobe/ecs" {
    export interface Components {
        [cell]: { type: readonly [number, number] };
        [point]: { type: { readonly x: number; readonly y: number } };
        [amount]: { type: number };
        [name]: { type: string };
        [node]: { type: { readonly label: string } };
        [tags]: { type: ReadonlySet<string> };
        [shown]: { type: true };
        [parent]: { type: Entity; reference: "owner" };
        [handle]: { type: () => void };
        [view]: { type: { readonly label: string }; thread: "main" };
    }
}
Component.register(cell, { type: { type: "array", items: { type: "integer", minimum: -1000, maximum: 1000 }, minItems: 2, maxItems: 2 } });
Component.register(point, { type: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"] } });
Component.register(amount, { type: { type: "number" } });
Component.register(name, { type: { type: "string" } });
Component.register(node, { type: { type: "object", properties: { label: { type: "string" } } } });
Component.register(tags, { type: { type: "set", items: { type: "string" } } });
Component.register(shown, { type: { const: true } });
Component.register(parent, { type: Entity.schema, reference: "owner" });
Component.register(handle, {});
Component.register(view, { type: { type: "object", properties: { label: { type: "string" } } }, thread: "main" });

/** Declares as an untyped caller would, bypassing the types' checks. */
const untyped = (declaration: object): unknown => Reflect.apply(Index.create, undefined, [declaration]);

describe("Index.create", () => {
    it("returns an index labeled by its name, its binding and id, or its kind numbered", () => {
        const named = Index.create({ name: "indexCreateTest/named", key: [amount] });
        expect(named.name).toBe("indexCreateTest/named");
        const bound = Index.create(identify({ key: [amount], sorted: true }, "i.ts#bound"));
        expect(bound.name).toBe("bound (i.ts#bound)");
        expect(Index.create({ key: [amount] }).name).toMatch(/^index #\d+$/);
    });
    it("is the index already recorded when declared again under its id the same, and throws for another declaration", () => {
        const first = Index.create(identify({ name: "indexCreateTest/again", key: [cell], components: { has: [shown] } }, "i.ts#again"));
        expect(Index.create(identify({ name: "indexCreateTest/again", key: [cell], components: { has: [shown] } }, "i.ts#again"))).toBe(first);
        expect(() => Index.create(identify({ name: "indexCreateTest/again", key: [amount] }, "i.ts#again"))).toThrow("reload the page");
        // Another value is another index.
        expect(Index.create({ name: "indexCreateTest/again", key: [cell], components: { has: [shown] } })).not.toBe(first);
    });
    it("throws for key parts that aren't components of data, are listed twice, or are sets", () => {
        expect(() => untyped({ name: "bad" })).toThrow(`Index "bad" needs a key`);
        expect(() => untyped({ name: "bad", key: amount })).toThrow(`Index "bad" needs a key`);
        expect(() => untyped({ name: "bad", key: [unregistered] })).toThrow(`key part "indexCreateTest/unregistered", which isn't a registered component of data`);
        expect(() => untyped({ name: "bad", key: [handle] })).toThrow("isn't a registered component of data");
        expect(() => untyped({ name: "bad", key: [amount, amount] })).toThrow(`lists key part "indexCreateTest/amount" twice`);
        expect(() => untyped({ name: "bad", key: [tags] })).toThrow("a set or map");
    });
    it("takes an empty key, holding the entities with its has and not, and isn't unique then", () => {
        expect(() => Index.create({ key: [] })).not.toThrow();
        expect(() => Index.create({ key: [], sorted: true, components: { has: [amount], not: [shown] } })).not.toThrow();
        expect(() => untyped({ name: "bad", key: [], unique: true })).toThrow(`Index "bad" is unique without a key`);
        expect(() => untyped({ name: "bad", key: [], components: { has: [shown], not: [shown] } })).toThrow("which it holds by");
        expect(() => untyped({ name: "bad", key: [], components: { has: [unregistered] } })).toThrow("isn't a registered component");
    });
    it("orders sorted parts that have an order: numbers, booleans, entities, strings and tuples of them", () => {
        expect(() => Index.create({ key: [cell, amount, name, parent], sorted: true })).not.toThrow();
        expect(() => untyped({ name: "bad", key: [point], sorted: true })).toThrow(`sorted by "indexCreateTest/point", whose values have no order`);
        expect(() => untyped({ name: "bad", key: [node], sorted: true })).toThrow("whose values have no order");
        // A hash part may be any data.
        expect(() => Index.create({ key: [point, node] })).not.toThrow();
    });
    it("throws for object parts on two threads and for has and not naming what they can't", () => {
        expect(() => untyped({ name: "bad", key: [node, view] })).toThrow(`key parts on threads "world" and "main"`);
        expect(() => untyped({ name: "bad", key: [name, view] })).toThrow(`key parts on threads "world" and "main"; its object parts live on one thread, the world's beside a string`);
        expect(() => untyped({ name: "bad", key: [amount], components: { has: [unregistered] } })).toThrow("isn't a registered component");
        expect(() => untyped({ name: "bad", key: [amount], components: { not: [unregistered] } })).toThrow("isn't a registered component");
        expect(() => untyped({ name: "bad", key: [amount], components: { not: [amount] } })).toThrow(`excludes "indexCreateTest/amount", which it holds by`);
        expect(() => untyped({ name: "bad", key: [amount], components: { has: [shown], not: [shown] } })).toThrow("which it holds by");
    });
});

describe("systems and finalizers looking up through an index", () => {
    const grid = Index.create({ name: "indexCreateTest/grid", key: [cell], components: { has: [amount] } });
    const untypedSystem = (declaration: object): unknown => Reflect.apply(System.create, undefined, [declaration, () => {}]);
    it("read the index's key parts, for ordering and conflicts, and are placed by them", () => {
        const reader = System.create({ name: "indexCreateTest/reader", lookup: { near: { index: grid, read: [amount] } } }, ({ lookup }) => { void lookup.near([0, 0]).at(0)[amount]; });
        const leaf = requireDefinition(reader);
        expect(isLeaf(leaf) ? [...accessOf(leaf).reads] : null).toEqual([amount, cell]);
        const writer = System.create({ name: "indexCreateTest/writer", components: { write: [cell] } }, row => { row[cell] = [0, 0]; });
        expect(() => System.create([reader, writer])).toThrow(`both access "indexCreateTest/cell" and one writes it`);
        expect(() => System.create({ systems: [reader, writer], before: [] })).toThrow("order them");
        const names = Index.create({ key: [view] });
        expect(threadOf({ lookup: { shown: { index: names } } }, "System", "placed")).toBe("main");
    });
    it("throw for a lookup through what isn't an index, reading or watching what not every entity it holds has, or a system writing its key or reads", () => {
        expect(() => untypedSystem({ name: "bad", lookup: { near: { index: { name: "fake" } } } })).toThrow(`lookup "near" goes through a value Index.create didn't return`);
        expect(() => untypedSystem({ name: "bad", lookup: { near: { index: grid, read: [name] } } })).toThrow(`lookup "near" reads "indexCreateTest/name", which not every entity index "indexCreateTest/grid" holds has`);
        expect(() => untypedSystem({ name: "bad", lookup: { near: { index: grid, changed: [name] } } })).toThrow(`lookup "near" watches "indexCreateTest/name"`);
        expect(() => untypedSystem({ name: "bad", components: { write: [cell] }, lookup: { near: { index: grid } } })).toThrow(`goes through an index keyed by "indexCreateTest/cell", which the system writes`);
        expect(() => untypedSystem({ name: "bad", components: { write: [amount] }, lookup: { near: { index: grid, read: [amount] } } })).toThrow(`reads "indexCreateTest/amount", which the system writes`);
        expect(() => untypedSystem({ name: "bad", kernel: "cpu", components: { write: [amount] }, lookup: { near: { index: Index.create({ key: [name] }) } } })).toThrow(`keyed by "indexCreateTest/name", a string, which kernels don't read yet`);
        expect(() => Reflect.apply(Finalizer.create, undefined, [{ name: "bad", components: { read: [amount] }, lookup: { near: { index: grid, read: [name] } } }, () => {}])).toThrow(`Finalizer "bad": lookup "near" reads`);
        expect(labelOfItem(grid)).toBe("indexCreateTest/grid");
    });
});

describe("systems ordering their rows by an index", () => {
    const ranked = Index.create({ name: "indexCreateTest/ranked", key: [amount], sorted: true, components: { has: [cell] } });
    const untypedSystem = (declaration: object): unknown => Reflect.apply(System.create, undefined, [declaration, () => {}]);
    it("read the index's key parts, for ordering and conflicts, and are placed by them", () => {
        const ordered = System.create({ name: "indexCreateTest/ordered", components: { read: [cell] }, order: ranked }, row => { void row[cell]; });
        const leaf = requireDefinition(ordered);
        expect(isLeaf(leaf) ? [...accessOf(leaf).reads] : null).toEqual([cell, amount]);
        const writer = System.create({ name: "indexCreateTest/rankWriter", components: { write: [amount] } }, row => { row[amount] = 0; });
        expect(() => System.create([ordered, writer])).toThrow(`both access "indexCreateTest/amount" and one writes it`);
        // Every value a sorted index orders lives in shared memory, strings included, so its key places nothing.
        expect(threadOf({ order: Index.create({ key: [name], sorted: true }) }, "System", "unplaced")).toBe(null);
    });
    it("throw for an order by what isn't a sorted index, without components, with up, on the GPU, or writing its key", () => {
        expect(() => untypedSystem({ name: "bad", components: { read: [cell] }, order: { name: "fake" } })).toThrow(`System "bad" orders its rows by a value Index.create didn't return`);
        expect(() => untypedSystem({ name: "bad", components: { read: [cell] }, order: Index.create({ name: "indexCreateTest/hashed", key: [amount] }) })).toThrow(`orders its rows by index "indexCreateTest/hashed", which isn't sorted`);
        expect(() => untypedSystem({ name: "bad", order: ranked })).toThrow("orders its rows without components");
        expect(() => untypedSystem({ name: "bad", components: { read: [cell] }, up: { through: parent }, order: ranked })).toThrow("uses both up and order");
        expect(() => untypedSystem({ name: "bad", kernel: "gpu", components: { write: [cell] }, order: ranked })).toThrow("GPU kernels have no order yet");
        expect(() => untypedSystem({ name: "bad", components: { write: [amount] }, order: ranked })).toThrow(`its rows are ordered by an index keyed by "indexCreateTest/amount", which the system writes`);
        expect(() => untypedSystem({ name: "bad", kernel: "cpu", components: { write: [amount] }, order: Index.create({ key: [name], sorted: true }) })).toThrow(`ordered by an index keyed by "indexCreateTest/name", a string, which kernels don't read yet`);
    });
});
