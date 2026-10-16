import { describe, expect, it } from "vitest";
import { Component } from "../../component/component.js";
import { Entity } from "../../entity/entity.js";
import { System } from "../../system/system.js";
import { createWorld } from "./create.js";

const local = "upTest/local";
const world = "upTest/world";
const parent = "upTest/parent";
const label = "upTest/label";

declare module "@adobe/data-ecs" {
    interface Components {
        [local]: { type: number };
        [world]: { type: number };
        [parent]: { type: Entity; reference: "owner" };
        [label]: { type: string };
    }
}

Component.register(local, { type: { type: "number" } });
Component.register(world, { type: { type: "number" } });
Component.register(parent, { type: Entity.schema, reference: "owner" });
Component.register(label, { type: { type: "string" } });

const ran: string[] = [];
const propagate = System.create({
    name: "upTest/propagate",
    components: { read: [local, label], write: [world] },
    up: { through: parent, read: [world] },
}, (row, { up }) => {
    ran.push(row[label]);
    row[world] = (up === null ? 0 : up[world]) + row[local];
});
const propagateChanged = System.create({
    name: "upTest/propagateChanged",
    components: { read: [local, label], write: [world], changed: [local] },
    up: { through: parent, read: [world] },
}, (row, { up }) => {
    ran.push(row[label]);
    row[world] = (up === null ? 0 : up[world]) + row[local];
});
const propagateChangedKernel = System.create({
    name: "upTest/propagateChangedKernel",
    kernel: "cpu",
    components: { read: [local], write: [world], changed: [local] },
    up: { through: parent, read: [world] },
}, (row, { up }) => {
    row[world] = (up === null ? 0 : up[world]) + row[local];
});
const propagateKernel = System.create({
    name: "upTest/propagateKernel",
    kernel: "cpu",
    components: { read: [local], write: [world] },
    up: { through: parent, read: [world] },
}, (row, { up }) => {
    row[world] = (up === null ? 0 : up[world]) + row[local];
});

/** Spawns a root with two trees under it, the grandchild stored before its parent so storage order isn't depth order. */
const entities: { [name: string]: Entity } = {};
const spawn = System.create({ name: "upTest/spawn" }, ({ commands }) => {
    entities.root = commands.spawn({ [label]: "root", [local]: 1, [world]: 0 });
    entities.grandchild = commands.spawn({ [label]: "grandchild", [local]: 100, [world]: 0, [parent]: entities.root });
    entities.child = commands.spawn({ [label]: "child", [local]: 10, [world]: 0, [parent]: entities.root });
    entities.other = commands.spawn({ [label]: "other", [local]: 1000, [world]: 0 });
});
const nest = System.create({ name: "upTest/nest" }, ({ commands }) => { commands.add(entities.grandchild, { [parent]: entities.child }); });
const bump = System.create({ name: "upTest/bump", input: { type: "object", properties: { entity: Entity.schema } } }, ({ input, commands }) => {
    commands.add(input.entity, { [local]: 2 });
});
const loop = System.create({ name: "upTest/loop" }, ({ commands }) => {
    commands.add(entities.root, { [parent]: entities.grandchild });
    commands.spawn({ [label]: "under", [local]: 5, [world]: 0, [parent]: entities.child });
});
const orphan = System.create({ name: "upTest/orphan" }, ({ commands }) => { commands.remove(entities.grandchild, parent); });

const worlds = (read: (entity: Entity) => number | null): { [name: string]: number | null } =>
    Object.fromEntries(Object.entries(entities).map(([name, entity]) => [name, read(entity)]));

describe("up", () => {
    for (const [kind, system] of [["main-thread", propagate], ["kernel", propagateKernel]] as const) {
        it(`runs parents before children, so each reads its parent's value from the same run, for a ${kind} system`, async () => {
            await using ecs = createWorld({ workers: 0 });
            await ecs.run(spawn);
            await ecs.run(nest);
            await ecs.run(system);
            expect(worlds(entity => ecs.read.component(entity, world))).toEqual({ root: 1, grandchild: 111, child: 11, other: 1000 });
        });
    }

    it("passes a row whose parent changed since the system last ran, with change filters", async () => {
        await using ecs = createWorld({ workers: 0 });
        await ecs.run(spawn);
        await ecs.run(nest);
        await ecs.run(propagateChanged);
        ran.length = 0;
        await ecs.run(bump, { entity: entities.root });
        await ecs.run(propagateChanged);
        expect(ran).toEqual(["root", "child", "grandchild"]);
        expect(worlds(entity => ecs.read.component(entity, world))).toEqual({ root: 2, grandchild: 112, child: 12, other: 1000 });
    });

    it("passes a row whose parent a kernel wrote earlier in the run, with change filters", async () => {
        await using ecs = createWorld({ workers: 0 });
        await ecs.run(spawn);
        await ecs.run(nest);
        await ecs.run(propagateChangedKernel);
        await ecs.run(bump, { entity: entities.root });
        await ecs.run(propagateChangedKernel);
        expect(worlds(entity => ecs.read.component(entity, world))).toEqual({ root: 2, grandchild: 112, child: 12, other: 1000 });
    });

    it("passes a row whose parent reference changed, with change filters", async () => {
        await using ecs = createWorld({ workers: 0 });
        await ecs.run(spawn);
        await ecs.run(propagateChanged);
        ran.length = 0;
        await ecs.run(nest);
        await ecs.run(propagateChanged);
        expect(ran).toEqual(["grandchild"]);
        expect(ecs.read.component(entities.grandchild, world)).toBe(111);
    });

    it("passes a row whose parent reference was removed, with change filters", async () => {
        await using ecs = createWorld({ workers: 0 });
        await ecs.run(spawn);
        await ecs.run(nest);
        await ecs.run(propagateChanged);
        ran.length = 0;
        await ecs.run(orphan);
        await ecs.run(propagateChanged);
        expect(ran).toEqual(["grandchild"]);
        expect(ecs.read.component(entities.grandchild, world)).toBe(100);
    });

    it("doesn't run rows on or under a parent cycle", async () => {
        await using ecs = createWorld({ workers: 0 });
        await ecs.run(spawn);
        await ecs.run(nest);
        await ecs.run(loop);
        ran.length = 0;
        await ecs.run(propagate);
        expect(ran).toEqual(["other"]);
    });

    it("rejects a through that isn't a reference, for untyped declarations", async () => {
        await using ecs = createWorld({ workers: 0 });
        // @ts-expect-error through is a reference component
        const untyped = System.create({ name: "upTest/untyped", components: { write: [world] }, up: { through: local, read: [world] } }, row => { row[world] = 0; });
        await expect(ecs.run(untyped)).rejects.toThrow('System "upTest/untyped": up.through "upTest/local" isn\'t a reference component.');
    });
});
