import { describe, expect, it } from "vitest";
import { Component } from "../../component/component.js";
import { System } from "../../system/system.js";
import type { Composite, CompositeDeclaration } from "../../system/composite.js";
import type { Declaration } from "../../system/declaration.js";
import type { Leaf } from "../../system/leaf.js";
import { scheduleOf } from "./schedule.js";

const value = "scheduleTest/value";
const other = "scheduleTest/other";

declare module "@adobe/data-ecs" {
    export interface Components {
        [value]: { type: number };
        [other]: { type: number };
    }
    export interface Systems {
        "scheduleTest/a": true;
        "scheduleTest/b": true;
        "scheduleTest/c": true;
        "scheduleTest/d": true;
        "scheduleTest/group": true;
        "scheduleTest/root": true;
    }
}

Component.register(value, { type: { type: "number" } });
Component.register(other, { type: { type: "number" } });

/** Systems built as values, so each test can reuse names without claiming them program-wide. */
const leaf = (declaration: Declaration & { readonly input?: undefined }): Leaf<Declaration & { readonly input?: undefined }> => ({ kind: "system", declaration, body: () => {} });
const composite = (declaration: CompositeDeclaration): Composite => ({ kind: "composite", declaration });

const names = (system: System): string[][] => scheduleOf(system).tiers.map(tier => tier.map(leaf => leaf.declaration.name));

describe("scheduleOf", () => {
    it("tiers by longest ordering path, keeping flatten order within a tier", () => {
        const a = leaf({ name: "scheduleTest/a" });
        const b = leaf({ name: "scheduleTest/b", after: ["scheduleTest/a"] });
        const c = leaf({ name: "scheduleTest/c", before: ["scheduleTest/b"] });
        const d = leaf({ name: "scheduleTest/d" });
        const root = composite({ name: "scheduleTest/root", systems: [b, d, c, a] });
        expect(names(root)).toEqual([["scheduleTest/d", "scheduleTest/c", "scheduleTest/a"], ["scheduleTest/b"]]);
    });

    it("applies a composite's constraints to every member, and resolves composite names to their members", () => {
        const a = leaf({ name: "scheduleTest/a" });
        const b = leaf({ name: "scheduleTest/b" });
        const c = leaf({ name: "scheduleTest/c", after: ["scheduleTest/group"] });
        const group = composite({ name: "scheduleTest/group", systems: [a, b], after: ["scheduleTest/d"] });
        const d = leaf({ name: "scheduleTest/d" });
        expect(names(composite({ name: "scheduleTest/root", systems: [c, group, d] })))
            .toEqual([["scheduleTest/d"], ["scheduleTest/a", "scheduleTest/b"], ["scheduleTest/c"]]);
    });

    it("pulls during pairs into one tier unless an ordering path separates them", () => {
        const a = leaf({ name: "scheduleTest/a" });
        const b = leaf({ name: "scheduleTest/b", after: ["scheduleTest/a"] });
        const c = leaf({ name: "scheduleTest/c", during: ["scheduleTest/b"] });
        const d = leaf({ name: "scheduleTest/d", after: ["scheduleTest/c"] });
        expect(names(composite({ name: "scheduleTest/root", systems: [a, b, c, d] })))
            .toEqual([["scheduleTest/a"], ["scheduleTest/b", "scheduleTest/c"], ["scheduleTest/d"]]);
    });

    it("ignores constraints naming systems outside the one being scheduled", () => {
        const a = leaf({ name: "scheduleTest/a", after: ["scheduleTest/d"] });
        expect(names(composite({ name: "scheduleTest/root", systems: [a] }))).toEqual([["scheduleTest/a"]]);
    });

    it("throws on a cycle", () => {
        const a = leaf({ name: "scheduleTest/a", after: ["scheduleTest/b"] });
        const b = leaf({ name: "scheduleTest/b", after: ["scheduleTest/a"] });
        expect(() => scheduleOf(composite({ name: "scheduleTest/root", systems: [a, b] }))).toThrow("Ordering cycle");
    });

    it("throws on an unordered write conflict, but not when ordered or disjoint", () => {
        const a = leaf({ name: "scheduleTest/a", components: { write: [value] } });
        const b = leaf({ name: "scheduleTest/b", components: { read: [value] } });
        const c = leaf({ name: "scheduleTest/c", components: { write: [other] }, during: ["scheduleTest/a"] });
        expect(() => scheduleOf(composite({ name: "scheduleTest/root", systems: [a, b] }))).toThrow('"scheduleTest/a" and "scheduleTest/b"');
        const ordered = leaf({ ...b.declaration, after: ["scheduleTest/a"] });
        expect(names(composite({ name: "scheduleTest/root", systems: [a, ordered, c] })))
            .toEqual([["scheduleTest/a", "scheduleTest/c"], ["scheduleTest/b"]]);
    });

    it("throws on two different systems with one name", () => {
        const a = leaf({ name: "scheduleTest/a" });
        const copy = leaf({ name: "scheduleTest/a" });
        expect(() => scheduleOf(composite({ name: "scheduleTest/root", systems: [a, copy] }))).toThrow('named "scheduleTest/a"');
    });
});
