import { describe, expect, it } from "vitest";
import { Component } from "../../interface/component/component.js";
import type { Composite } from "../../interface/system/composite.js";
import type { Declaration } from "../../interface/system/declaration.js";
import type { Definition } from "../../interface/registry/index.js";
import type { Leaf } from "../../interface/system/leaf.js";
import { scheduleOf } from "../../interface/registry/schedule.js";

const value = "scheduleTest/value";
const other = "scheduleTest/other";

declare module "@adobe/data-ecs" {
    export interface Components {
        [value]: { type: number };
        [other]: { type: number };
    }
}

Component.register(value, { type: { type: "number" } });
Component.register(other, { type: { type: "number" } });

/** Systems built as values, so each test can reuse names without claiming them program-wide. */
const leaf = (declaration: Declaration): Leaf => ({ kind: "system", name: declaration.name, declaration, body: () => {} });
const composite = (declaration: Composite["declaration"]): Composite => ({ kind: "composite", name: declaration.name, declaration });

const names = (system: Definition): string[][] => scheduleOf(system).tiers.map(tier => tier.map(leaf => leaf.declaration.name));

describe("scheduleOf", () => {
    it("tiers by longest ordering path, keeping flatten order within a tier", () => {
        const a = leaf({ name: "scheduleTest/a" });
        const b = leaf({ name: "scheduleTest/b", after: [{ name: "scheduleTest/a" }] });
        const c = leaf({ name: "scheduleTest/c", before: [{ name: "scheduleTest/b" }] });
        const d = leaf({ name: "scheduleTest/d" });
        const root = composite({ name: "scheduleTest/root", systems: [b, d, c, a] });
        expect(names(root)).toEqual([["scheduleTest/d", "scheduleTest/c", "scheduleTest/a"], ["scheduleTest/b"]]);
    });

    it("applies a composite's constraints to every member, and resolves composite names to their members", () => {
        const a = leaf({ name: "scheduleTest/a" });
        const b = leaf({ name: "scheduleTest/b" });
        const c = leaf({ name: "scheduleTest/c", after: [{ name: "scheduleTest/group" }] });
        const group = composite({ name: "scheduleTest/group", systems: [a, b], after: [{ name: "scheduleTest/d" }] });
        const d = leaf({ name: "scheduleTest/d" });
        expect(names(composite({ name: "scheduleTest/root", systems: [c, group, d] })))
            .toEqual([["scheduleTest/d"], ["scheduleTest/a", "scheduleTest/b"], ["scheduleTest/c"]]);
    });

    it("pulls during pairs into one tier unless an ordering path separates them", () => {
        const a = leaf({ name: "scheduleTest/a" });
        const b = leaf({ name: "scheduleTest/b", after: [{ name: "scheduleTest/a" }] });
        const c = leaf({ name: "scheduleTest/c", during: [{ name: "scheduleTest/b" }] });
        const d = leaf({ name: "scheduleTest/d", after: [{ name: "scheduleTest/c" }] });
        expect(names(composite({ name: "scheduleTest/root", systems: [a, b, c, d] })))
            .toEqual([["scheduleTest/a"], ["scheduleTest/b", "scheduleTest/c"], ["scheduleTest/d"]]);
    });

    it("orders a system during another between what that system follows and what follows it", () => {
        const update = leaf({ name: "scheduleTest/update" });
        const render = leaf({ name: "scheduleTest/render", after: [update] });
        const writer = leaf({ name: "scheduleTest/writer", components: { write: [value] }, during: [update] });
        const reader = leaf({ name: "scheduleTest/reader", components: { read: [value] }, during: [render] });
        expect(names(composite({ name: "scheduleTest/root", systems: [reader, writer, update, render] })))
            .toEqual([["scheduleTest/writer", "scheduleTest/update"], ["scheduleTest/reader", "scheduleTest/render"]]);
    });

    it("takes the order of a system during a system that is itself during another", () => {
        const update = leaf({ name: "scheduleTest/update" });
        const render = leaf({ name: "scheduleTest/render", after: [update] });
        const physics = leaf({ name: "scheduleTest/physics", during: [update] });
        const writer = leaf({ name: "scheduleTest/writer", components: { write: [value] }, during: [physics] });
        const reader = leaf({ name: "scheduleTest/reader", components: { read: [value] }, during: [render] });
        expect(names(composite({ name: "scheduleTest/root", systems: [reader, writer, physics, update, render] })))
            .toEqual([["scheduleTest/writer", "scheduleTest/physics", "scheduleTest/update"], ["scheduleTest/reader", "scheduleTest/render"]]);
    });

    it("orders a system during a composite around the composite, not between its members", () => {
        const start = leaf({ name: "scheduleTest/start", components: { write: [other] } });
        const a = leaf({ name: "scheduleTest/a" });
        const b = leaf({ name: "scheduleTest/b", after: [a] });
        const group = composite({ name: "scheduleTest/group", systems: [a, b], after: [start] });
        const end = leaf({ name: "scheduleTest/end", components: { read: [value] }, after: [group] });
        const c = leaf({ name: "scheduleTest/c", components: { read: [other], write: [value] }, during: [group] });
        expect(names(composite({ name: "scheduleTest/root", systems: [c, start, group, end] })))
            .toEqual([["scheduleTest/start"], ["scheduleTest/c", "scheduleTest/a"], ["scheduleTest/b"], ["scheduleTest/end"]]);
    });

    it("still throws on conflicting systems during one system, and on a during that contradicts before or after", () => {
        const update = leaf({ name: "scheduleTest/update" });
        const render = leaf({ name: "scheduleTest/render", after: [update] });
        const a = leaf({ name: "scheduleTest/a", components: { write: [value] }, during: [update] });
        const b = leaf({ name: "scheduleTest/b", components: { write: [value] }, during: [update] });
        expect(() => scheduleOf(composite({ name: "scheduleTest/root", systems: [update, render, a, b] }))).toThrow('"scheduleTest/a" and "scheduleTest/b"');
        const late = leaf({ name: "scheduleTest/late", during: [update], after: [render] });
        expect(() => scheduleOf(composite({ name: "scheduleTest/root", systems: [update, render, late] }))).toThrow("Ordering cycle");
    });

    it("ignores constraints naming systems outside the one being scheduled", () => {
        const a = leaf({ name: "scheduleTest/a", after: [{ name: "scheduleTest/d" }] });
        expect(names(composite({ name: "scheduleTest/root", systems: [a] }))).toEqual([["scheduleTest/a"]]);
    });

    it("throws on a cycle", () => {
        const a = leaf({ name: "scheduleTest/a", after: [{ name: "scheduleTest/b" }] });
        const b = leaf({ name: "scheduleTest/b", after: [{ name: "scheduleTest/a" }] });
        expect(() => scheduleOf(composite({ name: "scheduleTest/root", systems: [a, b] }))).toThrow("Ordering cycle");
    });

    it("throws on an unordered write conflict, but not when ordered or disjoint", () => {
        const a = leaf({ name: "scheduleTest/a", components: { write: [value] } });
        const b = leaf({ name: "scheduleTest/b", components: { read: [value] } });
        const c = leaf({ name: "scheduleTest/c", components: { write: [other] }, during: [{ name: "scheduleTest/a" }] });
        expect(() => scheduleOf(composite({ name: "scheduleTest/root", systems: [a, b] }))).toThrow('"scheduleTest/a" and "scheduleTest/b"');
        const ordered = leaf({ ...b.declaration, after: [{ name: "scheduleTest/a" }] });
        expect(names(composite({ name: "scheduleTest/root", systems: [a, ordered, c] })))
            .toEqual([["scheduleTest/a", "scheduleTest/c"], ["scheduleTest/b"]]);
    });

    it("throws on two different systems with one name", () => {
        const a = leaf({ name: "scheduleTest/a" });
        const copy = leaf({ name: "scheduleTest/a" });
        expect(() => scheduleOf(composite({ name: "scheduleTest/root", systems: [a, copy] }))).toThrow('named "scheduleTest/a"');
    });
});
