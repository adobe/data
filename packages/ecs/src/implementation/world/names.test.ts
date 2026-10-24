// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Finalizer } from "../../interface/finalizer/finalizer.js";
import { identify } from "../../interface/registry/ids.test-helper.js";
import { workers } from "../../interface/resources/workers.js";
import { Rule } from "../../interface/rule/rule.js";
import { System } from "../../interface/system/system.js";
import { createWorld } from "./create.js";
import { count } from "./reads.test-helper.js";
import { runReported } from "./reports.test-helper.js";

const value = Symbol("namesTest/value");
const other = Symbol("namesTest/other");
const first = Symbol("namesTest/first");
const second = Symbol("namesTest/second");

declare module "@adobe/ecs" {
    export interface Components {
        [value]: { type: number };
        [other]: { type: number };
        [first]: { type: true; derived: true };
        [second]: { type: true; derived: true };
    }
}


// Two libraries, written apart, each declare a rule, a finalizer and a system labeled "linked".
const library = (finalizer: (row: { readonly [value]: number }) => void, derived: typeof first | typeof second) => {
    Rule.create({ components: { with: [value] }, derive: [derived] });
    // Its body is written in place, so the build reads it, and calls what it's given with the row.
    Finalizer.create({ components: { with: [value] } }, row => finalizer(row));
};
const released: string[] = [];
let failing = false;
library(row => { released.push(`first ${row[value]}`); }, first);
library(row => { released.push(`second ${row[value]}`); if (failing) throw new Error("second failed"); }, second);

const ran: string[] = [];
const spawn = System.create({}, ({ commands }) => { commands.spawn([value])({ [value]: 1 }); });
const despawn = System.create({ components: { with: [value] } }, (row, { commands }) => { commands.despawn(row.entity); });
const failOnce = System.create(() => { throw new Error("unnamed"); });

describe("systems, rules and finalizers of one label", () => {
    it("are distinct in schedules, both run, and are told apart in reports by their ids", async () => {
        const linked = (after: readonly System[], body: (row: { [value]: number }) => void): System => System.create({ components: { with: [value] }, after }, body);
        const a = linked([], row => { ran.push("a"); row[value] += 1; });
        const b = linked([a], row => { ran.push("b"); row[value] += 1; throw new Error("b failed"); });
        const c = linked([b], row => { ran.push(`c${row[value]}`); });
        await using world = createWorld({ [workers]: 0 });
        await world.run(spawn);
        const report = await runReported(world, System.create({ systems: [c, b, a] }));
        expect(ran).toEqual(["a", "b"]);
        expect(report.failures.map(({ kind, name, id, message }) => ({ kind, name, id, message }))).toEqual([{ kind: "system", name: "linked", id: null, message: "b failed" }]);
        expect(report.skipped).toEqual(["linked"]);
    });
    it("both apply, as rules and as finalizers", async () => {
        await using world = createWorld({ [workers]: 0 });
        await world.run(spawn);
        expect(await count(world, { required: [value, first, second] })).toBe(1);
        released.length = 0;
        failing = true;
        const report = await runReported(world, despawn);
        failing = false;
        expect(released).toEqual(["first 1", "second 1"]);
        expect(report.failures.map(({ kind, name }) => ({ kind, name }))).toEqual([{ kind: "finalizer", name: "library" }]);
    });
    it("are labeled by the bindings of their ids, which reports give beside them", async () => {
        const [one, two] = ["one.ts#library", "two.ts#library"].map(id => System.create(identify({ components: { with: [other] } }, id), row => { row[other] = 1; throw new Error(id); }));
        await using world = createWorld({ [workers]: 0 });
        await world.run(System.create({}, ({ commands }) => { commands.spawn([other])({ [other]: 0 }); }));
        const labels = async (system: System | undefined) => system === undefined ? [] : (await runReported(world, system)).failures.map(failure => [failure.name, failure.id]);
        expect([await labels(one), await labels(two)]).toEqual([[["library", "one.ts#library"]], [["library", "two.ts#library"]]]);
    });
    it("label a top-level system by its binding, its id naming its package, version, module and binding", async () => {
        await using world = createWorld({ [workers]: 0 });
        expect((await runReported(world, failOnce)).failures.map(failure => [failure.name, failure.id])).toEqual([["failOnce", expect.stringMatching(/^@adobe\/ecs@[^/]+\/src\/implementation\/world\/names\.test\.ts#failOnce$/)]]);
    });
});
