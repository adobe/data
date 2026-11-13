// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect, it } from "vitest";
import { System } from "../../index.js";
import { Observe } from "../../observe/index.js";
import { createWorld } from "../index.js";
import { sameValue } from "./resource-changes.js";

const size = Symbol("resourceChanges/size");
const corner = Symbol("resourceChanges/corner");
const unwatched = Symbol("resourceChanges/unwatched");
const log = Symbol("resourceChanges/log");
const label = Symbol("resourceChanges/label");

declare module "@adobe/ecs" {
    interface Components {
        [label]: { type: string };
    }
    interface Resources {
        [size]: { type: number; default: 1 };
        [corner]: { type: readonly [number, number] };
        [unwatched]: { type: number };
        [log]: { type: readonly string[]; default: [] };
    }
}

// Watching only resources, it sees no component's changes.
const record = System.changes({ watch: [size, corner] }, (changes, { resources }) => {
    const lines = changes.resources.map(change => change.key === size ? `size ${change.previous} → ${change.next}` : `corner ${change.previous.join(",")} → ${change.next.join(",")}`);
    resources[log] = [...resources[log], ...changes.groups.map(() => "group"), ...lines];
});

const resize = System.create({}, ({ resources }, input: { readonly to: number }) => {
    resources[size] = input.to;
    resources[size] = input.to + 1;
});
const move = System.create({}, ({ resources }, input: { readonly x: number }) => { resources[corner] = [input.x, 0]; });
const touch = System.create({}, ({ resources }) => { resources[unwatched] += 1; });
const spawn = System.create({}, ({ commands }) => { commands.spawn([label])({ [label]: "a" }); });
const read = System.create({ readonly: true }, ({ resources }) => resources[log]);

it("reports each watched resource written since its sync systems last ran, with its first and last value, once", async () => {
    await using world = createWorld();
    world.add(record);
    // A run writing nothing else still has a sync point, so its sync systems see the write.
    await world.run(resize, { to: 4 });
    expect(await world.run(read)).toEqual(["size 1 → 5"]);
    await world.run(spawn);
    await world.run(touch);
    expect(await world.run(read)).toEqual(["size 1 → 5"]);
    await world.run(move, { x: 2 });
    // Written back to an equal value, leaf by leaf: not reported.
    await world.run(move, { x: 2 });
    await world.run(resize, { to: 4 });
    expect(await world.run(read)).toEqual(["size 1 → 5", "corner 0,0 → 2,0"]);
    expect(await Observe.toPromise(Observe.resource(world, size))).toBe(5);
});

it("compares data leaf by leaf and other objects by identity", () => {
    const map = new Map();
    expect([sameValue([1, { a: -0 }], [1, { a: -0 }]), sameValue({ a: 1 }, { a: 1, b: 2 }), sameValue(0, -0), sameValue(NaN, NaN), sameValue(map, new Map()), sameValue(map, map)])
        .toEqual([true, false, false, true, false, true]);
});
