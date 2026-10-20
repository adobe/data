import { expect, it } from "vitest";
import { Component, System } from "../../index.js";
import { workers } from "../../interface/resources/workers.js";
import { createWorld } from "../index.js";

// Keys named as the generated spawn and add functions name their own bindings: none may capture them.
const p = Symbol("p");
const c = Symbol("c");
const l = Symbol("l");
const s = Symbol("s");
const e = Symbol("e");
const v0 = Symbol("v0");
const v1 = Symbol("v1");

declare module "@adobe/data-ecs" {
    interface Components {
        [p]: { type: number };
        [c]: { type: number };
        [l]: { type: number };
        [s]: { type: number };
        [e]: { type: number };
        [v0]: { type: number };
        [v1]: { type: number };
    }
}

const number = { type: { type: "number" } } as const;
Component.register(p, number);
Component.register(c, number);
Component.register(l, number);
Component.register(s, number);
Component.register(e, number);
Component.register(v0, number);
Component.register(v1, number);

const spawn = System.create(({ commands }) => {
    const spawned = commands.spawn([p, c, l, s])({ [p]: 1, [c]: 2, [l]: 3, [s]: 4 });
    commands.add(spawned, [e, v0, v1], { [e]: 5, [v0]: 6, [v1]: 7 });
    const added = commands.spawn([c, l, s, e, v0, v1])({ [c]: 12, [l]: 13, [s]: 14, [e]: 15, [v0]: 16, [v1]: 17 });
    commands.add(added, [p], { [p]: 11 });
});

const read: number[][] = [];
const readAll = System.create({ observer: true, components: { read: [p, c, l, s, e, v0, v1] } }, row => {
    read.push([row[p], row[c], row[l], row[s], row[e], row[v0], row[v1]]);
});

// A kernel whose module constant and locals are named as the kernel emitter's bindings.
const i = 100;
const grow = System.create({ kernel: "cpu", components: { read: [c, l], write: [p, s] } }, row => {
    const n = row[c];
    const x0 = row[l];
    const s0 = n + x0;
    row[p] = s0 + i;
    row[s] = row[p] - n;
});

it("runs a kernel whose names are the kernel emitter's", async () => {
    await using world = createWorld({ [workers]: 0 });
    await world.run(spawn);
    await world.run(grow);
    read.length = 0;
    await world.run(readAll);
    expect(read.sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0))).toEqual([[105, 2, 3, 103, 5, 6, 7], [125, 12, 13, 113, 15, 16, 17]]);
});

it("spawns and adds through keys named as the generated code's bindings", async () => {
    await using world = createWorld({ [workers]: 0 });
    await world.run(spawn);
    read.length = 0;
    await world.run(readAll);
    expect(read.sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0))).toEqual([[1, 2, 3, 4, 5, 6, 7], [11, 12, 13, 14, 15, 16, 17]]);
});
