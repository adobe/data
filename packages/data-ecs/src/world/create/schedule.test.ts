import { describe, expect, it } from "vitest";
import { Component } from "../../component/component.js";
import { System } from "../../system/system.js";
import { createSchedule } from "./schedule.js";

const value = "scheduleTest/value";
const other = "scheduleTest/other";

declare module "../../component/types.js" {
    export interface Types {
        [value]: { type: number };
        [other]: { type: number };
    }
}
declare module "../../system/types.js" {
    export interface Types {
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

const names = (system: System): string[][] => createSchedule(system).tiers.map(tier => tier.map(leaf => leaf.declaration.name));

describe("createSchedule", () => {
    it("tiers by longest ordering path, keeping flatten order within a tier", () => {
        const a = System.create({ name: "scheduleTest/a" }, () => {});
        const b = System.create({ name: "scheduleTest/b", after: ["scheduleTest/a"] }, () => {});
        const c = System.create({ name: "scheduleTest/c", before: ["scheduleTest/b"] }, () => {});
        const d = System.create({ name: "scheduleTest/d" }, () => {});
        const root = System.composite({ name: "scheduleTest/root", systems: [b, d, c, a] });
        expect(names(root)).toEqual([["scheduleTest/d", "scheduleTest/c", "scheduleTest/a"], ["scheduleTest/b"]]);
    });

    it("applies a composite's constraints to every member, and resolves composite names to their members", () => {
        const a = System.create({ name: "scheduleTest/a" }, () => {});
        const b = System.create({ name: "scheduleTest/b" }, () => {});
        const c = System.create({ name: "scheduleTest/c", after: ["scheduleTest/group"] }, () => {});
        const group = System.composite({ name: "scheduleTest/group", systems: [a, b], after: ["scheduleTest/d"] });
        const d = System.create({ name: "scheduleTest/d" }, () => {});
        expect(names(System.composite({ name: "scheduleTest/root", systems: [c, group, d] })))
            .toEqual([["scheduleTest/d"], ["scheduleTest/a", "scheduleTest/b"], ["scheduleTest/c"]]);
    });

    it("pulls during pairs into one tier unless an ordering path separates them", () => {
        const a = System.create({ name: "scheduleTest/a" }, () => {});
        const b = System.create({ name: "scheduleTest/b", after: ["scheduleTest/a"] }, () => {});
        const c = System.create({ name: "scheduleTest/c", during: ["scheduleTest/b"] }, () => {});
        const d = System.create({ name: "scheduleTest/d", after: ["scheduleTest/c"] }, () => {});
        expect(names(System.composite({ name: "scheduleTest/root", systems: [a, b, c, d] })))
            .toEqual([["scheduleTest/a"], ["scheduleTest/b", "scheduleTest/c"], ["scheduleTest/d"]]);
    });

    it("ignores constraints naming systems outside the one being scheduled", () => {
        const a = System.create({ name: "scheduleTest/a", after: ["scheduleTest/d"] }, () => {});
        expect(names(System.composite({ name: "scheduleTest/root", systems: [a] }))).toEqual([["scheduleTest/a"]]);
    });

    it("throws on a cycle", () => {
        const a = System.create({ name: "scheduleTest/a", after: ["scheduleTest/b"] }, () => {});
        const b = System.create({ name: "scheduleTest/b", after: ["scheduleTest/a"] }, () => {});
        expect(() => createSchedule(System.composite({ name: "scheduleTest/root", systems: [a, b] }))).toThrow("Ordering cycle");
    });

    it("throws on an unordered write conflict, but not when ordered or disjoint", () => {
        const a = System.create({ name: "scheduleTest/a", query: { write: [value] } }, row => { row[value] = 0; });
        const b = System.create({ name: "scheduleTest/b", query: { read: [value] } }, row => { void row[value]; });
        const c = System.create({ name: "scheduleTest/c", query: { write: [other] }, during: ["scheduleTest/a"] }, row => { row[other] = 0; });
        expect(() => createSchedule(System.composite({ name: "scheduleTest/root", systems: [a, b] }))).toThrow('"scheduleTest/a" and "scheduleTest/b"');
        const ordered = System.create({ ...b.declaration, after: ["scheduleTest/a"] }, b.body);
        expect(names(System.composite({ name: "scheduleTest/root", systems: [a, ordered, c] })))
            .toEqual([["scheduleTest/a", "scheduleTest/c"], ["scheduleTest/b"]]);
    });

    it("throws on two different systems with one name", () => {
        const a = System.create({ name: "scheduleTest/a" }, () => {});
        const copy = System.create({ name: "scheduleTest/a" }, () => {});
        expect(() => createSchedule(System.composite({ name: "scheduleTest/root", systems: [a, copy] }))).toThrow('named "scheduleTest/a"');
    });
});
