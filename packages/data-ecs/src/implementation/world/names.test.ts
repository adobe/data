import { describe, expect, it } from "vitest";
import { Component } from "../../interface/component/component.js";
import { Finalizer } from "../../interface/finalizer/finalizer.js";
import { identify } from "../../interface/registry/ids.test-helper.js";
import { workers } from "../../interface/resources/workers.js";
import { Rule } from "../../interface/rule/rule.js";
import { System } from "../../interface/system/system.js";
import { createWorld } from "./create.js";
import { count } from "./reads.test-helper.js";

const value = Symbol("namesTest/value");
const other = Symbol("namesTest/other");
const first = Symbol("namesTest/first");
const second = Symbol("namesTest/second");

declare module "@adobe/data-ecs" {
    export interface Components {
        [value]: typeof valueTraits;
        [other]: typeof otherTraits;
        [first]: typeof firstTraits;
        [second]: typeof secondTraits;
    }
}

const valueTraits = Component.register(value, { type: { type: "number" } });
const otherTraits = Component.register(other, { type: { type: "number" } });
const firstTraits = Component.register(first, { type: { const: true }, derived: true });
const secondTraits = Component.register(second, { type: { const: true }, derived: true });

// Two libraries, written apart, both name a rule, a finalizer and a system "linked".
Rule.create({ name: "namesTest/linked", components: { has: [value] }, derive: [first] });
Rule.create({ name: "namesTest/linked", components: { has: [value] }, derive: [second] });
const released: string[] = [];
let failing = false;
Finalizer.create({ name: "namesTest/linked", components: { read: [value] } }, row => { released.push(`first ${row[value]}`); });
Finalizer.create({ name: "namesTest/linked", components: { read: [value] } }, row => { released.push(`second ${row[value]}`); if (failing) throw new Error("second failed"); });

const ran: string[] = [];
const spawn = System.create({ name: "namesTest/spawn" }, ({ commands }) => { commands.spawn([value])({ [value]: 1 }); });
const despawn = System.create({ name: "namesTest/despawn", components: { has: [value] } }, (row, { commands }) => { commands.despawn(row.entity); });
const failOnce = System.create(() => { throw new Error("unnamed"); });

describe("systems, rules and finalizers of one name", () => {
    it("are distinct in schedules, both run, and are told apart in reports by their labels", async () => {
        const a = System.create({ name: "namesTest/linked", components: { write: [value] } }, row => { ran.push("a"); row[value] += 1; });
        const b = System.create({ name: "namesTest/linked", components: { write: [value] }, after: [a] }, row => { ran.push("b"); row[value] += 1; throw new Error("b failed"); });
        const c = System.create({ name: "namesTest/linked", components: { read: [value] }, after: [b] }, row => { ran.push(`c${row[value]}`); });
        await using world = createWorld({ [workers]: 0 });
        await world.run(spawn);
        const report = await world.run(System.create({ name: "namesTest/frame", systems: [c, b, a] }));
        expect(ran).toEqual(["a", "b"]);
        expect(report.failures.map(({ kind, name, message }) => ({ kind, name, message }))).toEqual([{ kind: "system", name: "namesTest/linked#6", message: "b failed" }]);
        expect(report.skipped).toEqual(["namesTest/linked#7"]);
    });
    it("both apply, as rules and as finalizers", async () => {
        await using world = createWorld({ [workers]: 0 });
        await world.run(spawn);
        expect(await count(world, { required: [value, first, second] })).toBe(1);
        released.length = 0;
        failing = true;
        const report = await world.run(despawn);
        failing = false;
        expect(released).toEqual(["first 1", "second 1"]);
        expect(report.failures.map(({ kind, name }) => ({ kind, name }))).toEqual([{ kind: "finalizer", name: "namesTest/linked#4" }]);
    });
    it("are labeled by name and id where the plugin gave ids", async () => {
        const write = (id: string) => System.create(identify({ name: "namesTest/library", components: { write: [other] } }, id), row => { row[other] = 1; throw new Error(id); });
        const one = write("one.ts#library");
        const two = write("two.ts#library");
        await using world = createWorld({ [workers]: 0 });
        await world.run(System.create({ name: "namesTest/spawnOther" }, ({ commands }) => { commands.spawn([other])({ [other]: 0 }); }));
        const names = async (system: System) => (await world.run(system)).failures.map(failure => failure.name);
        expect([await names(one), await names(two)]).toEqual([["namesTest/library (one.ts#library)"], ["namesTest/library (two.ts#library)"]]);
    });
    it("label a system without a name by its binding and the id the plugin gave it", async () => {
        await using world = createWorld({ [workers]: 0 });
        expect((await world.run(failOnce)).failures.map(failure => failure.name)).toEqual(["failOnce (@adobe/data-ecs/src/implementation/world/names.test.ts#failOnce)"]);
    });
});
