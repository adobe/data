// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import type { Composite } from "../../interface/system/composite.js";
import type { Declaration } from "../../interface/system/declaration.js";
import type { Definition } from "../../interface/registry/index.js";
import type { Leaf } from "../../interface/system/leaf.js";
import { scheduleOf } from "../../interface/registry/schedule.js";

const value = Symbol("scheduleTest/value");
const other = Symbol("scheduleTest/other");

declare module "@adobe/ecs" {
    export interface Components {
        [value]: { type: number };
        [other]: { type: number };
    }
}


/** Systems built as values, not registered, so each test's are its own. */
const leaf = (declaration: Declaration & { readonly name: string }): Leaf => ({ kind: "system", name: declaration.name, declaration, input: undefined, body: () => {} });
const composite = (declaration: Composite["declaration"] & { readonly name: string }): Composite => ({ kind: "composite", name: declaration.name, declaration });

const names = (system: Definition): string[][] => scheduleOf(system).tiers.map(tier => tier.map(leaf => leaf.name));

describe("scheduleOf", () => {
    it("tiers by longest ordering path, keeping flatten order within a tier", () => {
        const a = leaf({ name: "scheduleTest/a" });
        const b = leaf({ name: "scheduleTest/b", after: [a] });
        const c = leaf({ name: "scheduleTest/c", before: [b] });
        const d = leaf({ name: "scheduleTest/d" });
        const root = composite({ name: "scheduleTest/root", systems: [b, d, c, a] });
        expect(names(root)).toEqual([["scheduleTest/d", "scheduleTest/c", "scheduleTest/a"], ["scheduleTest/b"]]);
    });

    it("applies a composite's constraints to every member, and resolves composites to their members", () => {
        const a = leaf({ name: "scheduleTest/a" });
        const b = leaf({ name: "scheduleTest/b" });
        const d = leaf({ name: "scheduleTest/d" });
        const group = composite({ name: "scheduleTest/group", systems: [a, b], after: [d] });
        const c = leaf({ name: "scheduleTest/c", after: [group] });
        expect(names(composite({ name: "scheduleTest/root", systems: [c, group, d] })))
            .toEqual([["scheduleTest/d"], ["scheduleTest/a", "scheduleTest/b"], ["scheduleTest/c"]]);
    });

    it("pulls during pairs into one tier unless an ordering path separates them", () => {
        const a = leaf({ name: "scheduleTest/a" });
        const b = leaf({ name: "scheduleTest/b", after: [a] });
        const c = leaf({ name: "scheduleTest/c", during: [b] });
        const d = leaf({ name: "scheduleTest/d", after: [c] });
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
        const a = leaf({ name: "scheduleTest/a", after: [leaf({ name: "scheduleTest/d" })] });
        expect(names(composite({ name: "scheduleTest/root", systems: [a] }))).toEqual([["scheduleTest/a"]]);
    });

    it("throws on a cycle", () => {
        const a = leaf({ name: "scheduleTest/a" });
        const b = leaf({ name: "scheduleTest/b", after: [a], before: [a] });
        expect(() => scheduleOf(composite({ name: "scheduleTest/root", systems: [a, b] }))).toThrow("Ordering cycle");
    });

    it("throws on an unordered write conflict, but not when ordered or disjoint", () => {
        const a = leaf({ name: "scheduleTest/a", components: { write: [value] } });
        const b = leaf({ name: "scheduleTest/b", components: { read: [value] } });
        const c = leaf({ name: "scheduleTest/c", components: { write: [other] }, during: [a] });
        expect(() => scheduleOf(composite({ name: "scheduleTest/root", systems: [a, b] }))).toThrow('"scheduleTest/a" and "scheduleTest/b"');
        const ordered = leaf({ ...b.declaration, name: b.name, after: [a] });
        expect(names(composite({ name: "scheduleTest/root", systems: [a, ordered, c] })))
            .toEqual([["scheduleTest/a", "scheduleTest/c"], ["scheduleTest/b"]]);
    });

    it("schedules two systems of one name as two, and one listed twice as one", () => {
        const a = leaf({ name: "scheduleTest/a", components: { write: [value] } });
        const copy = leaf({ name: "scheduleTest/a", components: { write: [value] }, after: [a] });
        expect(scheduleOf(composite({ name: "scheduleTest/root", systems: [copy, a, a] })).tiers).toEqual([[a], [copy]]);
        expect(() => scheduleOf(composite({ name: "scheduleTest/root", systems: [a, leaf({ name: "scheduleTest/a", components: { write: [value] } })] }))).toThrow('Systems "scheduleTest/a" and "scheduleTest/a" both access');
    });
});
