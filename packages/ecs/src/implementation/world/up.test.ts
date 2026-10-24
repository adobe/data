// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Entity } from "../../interface/entity/entity.js";
import { System } from "../../interface/system/system.js";
import { definitionOf } from "../../interface/registry/index.js";
import { kernelOf } from "./attach-kernel.js";
import { createWorld } from "./create.js";
import { read, readEach } from "./reads.test-helper.js";
import { bindKernel } from "./kernels.js";
import { createState } from "./state.js";
import { workers } from "../../interface/resources/workers.js";

const local = Symbol("upTest/local");
const world = Symbol("upTest/world");
const parent = Symbol("upTest/parent");
const label = Symbol("upTest/label");
const visible = Symbol("upTest/visible");
const shown = Symbol("upTest/shown");
const anchor = Symbol("upTest/anchor");

declare module "@adobe/ecs" {
    interface Components {
        [local]: { type: number };
        [world]: { type: number };
        [parent]: { type: Entity; reference: "owner" };
        [label]: { type: string };
        [visible]: { type: boolean };
        [shown]: { type: boolean };
        [anchor]: { type: true };
    }
}


const ran: string[] = [];
const propagate = System.create({
    components: { read: [local, label], write: [world] },
    up: { through: parent, read: [world] },
}, (row, { up }) => {
    ran.push(row[label]);
    row[world] = (up === null ? 0 : up[world]) + row[local];
});
const propagateChanged = System.create({
    components: { read: [local, label], write: [world], changed: [local] },
    up: { through: parent, read: [world] },
}, (row, { up }) => {
    ran.push(row[label]);
    row[world] = (up === null ? 0 : up[world]) + row[local];
});
const propagateAdded = System.create({
    components: { read: [local, label], write: [world], added: [local] },
    up: { through: parent, read: [world] },
}, (row, { up }) => {
    ran.push(row[label]);
    row[world] = (up === null ? 0 : up[world]) + row[local];
});
const propagateChangedKernel = System.create({
    kernel: true,
    components: { read: [local], write: [world], changed: [local] },
    up: { through: parent, read: [world] },
}, (row, { up }) => {
    row[world] = (up === null ? 0 : up[world]) + row[local];
});
const propagateKernel = System.create({
    kernel: true,
    components: { read: [local], write: [world] },
    up: { through: parent, read: [world] },
}, (row, { up }) => {
    row[world] = (up === null ? 0 : up[world]) + row[local];
});

/** Spawns a root with two trees under it, the grandchild stored before its parent so storage order isn't depth order. */
const entities: { [name: string]: Entity } = {};
const spawn = System.create({}, ({ commands }) => {
    entities.root = commands.spawn([label, local, world])({ [label]: "root", [local]: 1, [world]: 0 });
    entities.grandchild = commands.spawn([label, local, world, parent])({ [label]: "grandchild", [local]: 100, [world]: 0, [parent]: entities.root });
    entities.child = commands.spawn([label, local, world, parent])({ [label]: "child", [local]: 10, [world]: 0, [parent]: entities.root });
    entities.other = commands.spawn([label, local, world])({ [label]: "other", [local]: 1000, [world]: 0 });
});
const nest = System.create({}, ({ commands }) => { commands.add(entities.grandchild, parent, entities.child); });
const bump = System.create({}, ({ commands }, input: { readonly entity: Entity }) => {
    commands.add(input.entity, local, 2);
});
const loop = System.create({}, ({ commands }) => {
    commands.add(entities.root, parent, entities.grandchild);
    commands.spawn([label, local, world, parent])({ [label]: "under", [local]: 5, [world]: 0, [parent]: entities.child });
});
/** Puts the root under the grandchild, two levels below it, then under `other`. */
const close = System.create({}, ({ commands }) => { commands.add(entities.root, parent, entities.grandchild); });
const open = System.create({}, ({ commands }) => { commands.add(entities.root, parent, entities.other); });
const orphan = System.create({}, ({ commands }) => { commands.remove(entities.grandchild, parent); });
/** Spawns `count` leaves under the grandchild, more than the journal keeps for a world this small. */
const bulk: Entity[] = [];
const bulkUnder = System.create({}, ({ commands }, input: { readonly count: number }) => {
    bulk.length = 0;
    for (let i = 0; i < input.count; i++) bulk.push(commands.spawn([label, local, world, parent])({ [label]: "bulk", [local]: 1, [world]: 0, [parent]: entities.grandchild }));
});

const worlds = async (value: (entity: Entity) => Promise<number | null>): Promise<{ [name: string]: number | null }> =>
    Object.fromEntries(await Promise.all(Object.entries(entities).map(async ([name, entity]) => [name, await value(entity)])));

const show = System.create({
    kernel: true,
    components: { read: [visible], write: [shown] },
    up: { through: parent, read: [shown] },
}, (row, { up }) => {
    row[shown] = up === null ? row[visible] : up[shown] && row[visible];
});

/** Children of one archetype whose parents are in three: a matched one, one the query doesn't match, and one without `world`. */
const mixed: { [name: string]: Entity } = {};
const spawnMixed = System.create({}, ({ commands }) => {
    mixed.root = commands.spawn([local, world])({ [local]: 1, [world]: 0 });
    mixed.anchored = commands.spawn([local, world, anchor])({ [local]: 2, [world]: 0, [anchor]: true });
    mixed.unmatched = commands.spawn([world])({ [world]: 50 });
    mixed.bare = commands.spawn([label])({ [label]: "bare" });
    mixed.underRoot = commands.spawn([local, world, parent])({ [local]: 10, [world]: 0, [parent]: mixed.root });
    mixed.underUnmatched = commands.spawn([local, world, parent])({ [local]: 10, [world]: 0, [parent]: mixed.unmatched });
    mixed.underAnchored = commands.spawn([local, world, parent])({ [local]: 10, [world]: 0, [parent]: mixed.anchored });
    mixed.underBare = commands.spawn([local, world, parent])({ [local]: 10, [world]: 0, [parent]: mixed.bare });
});
const growParents = System.create({}, ({ commands }) => {
    for (let i = 0; i < 100; i++) commands.spawn([local, world, anchor])({ [local]: 0, [world]: 0, [anchor]: true });
});
const shift = System.create({ components: { write: [local], has: [anchor] } }, row => { row[local] += 1; });

describe("up", () => {
    for (const [kind, system] of [["main-thread", propagate], ["kernel", propagateKernel]] as const) {
        it(`runs parents before children, so each reads its parent's value from the same run, for a ${kind} system`, async () => {
            await using ecs = createWorld({ [workers]: 0 });
            await ecs.run(spawn);
            await ecs.run(nest);
            await ecs.run(system);
            expect(await worlds(entity => read(ecs, entity, world))).toEqual({ root: 1, grandchild: 111, child: 11, other: 1000 });
        });
    }

    it("passes a row whose parent changed since the system last ran, with change filters", async () => {
        await using ecs = createWorld({ [workers]: 0 });
        await ecs.run(spawn);
        await ecs.run(nest);
        await ecs.run(propagateChanged);
        ran.length = 0;
        await ecs.run(bump, { entity: entities.root });
        await ecs.run(propagateChanged);
        expect(ran).toEqual(["root", "child", "grandchild"]);
        expect(await worlds(entity => read(ecs, entity, world))).toEqual({ root: 2, grandchild: 112, child: 12, other: 1000 });
    });

    it("doesn't pass a row whose component an added filter names only changed", async () => {
        await using ecs = createWorld({ [workers]: 0 });
        await ecs.run(spawn);
        await ecs.run(nest);
        await ecs.run(propagateAdded);
        ran.length = 0;
        await ecs.run(bump, { entity: entities.root });
        await ecs.run(propagateAdded);
        expect(ran).toEqual([]);
    });

    it("passes a row whose parent a kernel wrote earlier in the run, with change filters", async () => {
        await using ecs = createWorld({ [workers]: 0 });
        await ecs.run(spawn);
        await ecs.run(nest);
        await ecs.run(propagateChangedKernel);
        await ecs.run(bump, { entity: entities.root });
        await ecs.run(propagateChangedKernel);
        expect(await worlds(entity => read(ecs, entity, world))).toEqual({ root: 2, grandchild: 112, child: 12, other: 1000 });
    });

    it("passes a row whose parent reference changed, with change filters", async () => {
        await using ecs = createWorld({ [workers]: 0 });
        await ecs.run(spawn);
        await ecs.run(propagateChanged);
        ran.length = 0;
        await ecs.run(nest);
        await ecs.run(propagateChanged);
        expect(ran).toEqual(["grandchild"]);
        expect(await read(ecs, entities.grandchild, world)).toBe(111);
    });

    it("passes a row whose parent reference was removed, with change filters", async () => {
        await using ecs = createWorld({ [workers]: 0 });
        await ecs.run(spawn);
        await ecs.run(nest);
        await ecs.run(propagateChanged);
        ran.length = 0;
        await ecs.run(orphan);
        await ecs.run(propagateChanged);
        expect(ran).toEqual(["grandchild"]);
        expect(await read(ecs, entities.grandchild, world)).toBe(100);
    });

    it("runs every row after a spawn outruns the journal, with change filters, then only the rows that changed", async () => {
        await using ecs = createWorld({ [workers]: 0 });
        await ecs.run(spawn);
        await ecs.run(nest);
        await ecs.run(propagateChanged);
        await ecs.run(bulkUnder, { count: 5000 });
        ran.length = 0;
        await ecs.run(propagateChanged);
        expect(ran.length).toBe(4 + 5000);
        expect(ran.slice(0, 4).sort()).toEqual(["child", "grandchild", "other", "root"]);
        expect(await readEach(ecs, bulk.slice(0, 3), world)).toEqual([112, 112, 112]);
        ran.length = 0;
        await ecs.run(bump, { entity: entities.grandchild });
        await ecs.run(propagateChanged);
        expect(ran.length).toBe(1 + 5000);
        expect(await readEach(ecs, [entities.grandchild, bulk[4999]], world)).toEqual([13, 14]);
        ran.length = 0;
        await ecs.run(propagateChanged);
        expect(ran).toEqual([]);
    });

    it("finds a cycle a reparent closes after the tree was built, and runs its rows again once it opens", async () => {
        await using ecs = createWorld({ [workers]: 0 });
        await ecs.run(spawn);
        await ecs.run(nest);
        await ecs.run(propagateKernel);
        await ecs.run(close);
        await ecs.run(propagateKernel);
        expect(await worlds(entity => read(ecs, entity, world))).toEqual({ root: 1, grandchild: 111, child: 11, other: 1000 });
        await ecs.run(open);
        await ecs.run(propagateKernel);
        expect(await worlds(entity => read(ecs, entity, world))).toEqual({ root: 1001, grandchild: 1111, child: 1011, other: 1000 });
    });

    it("doesn't run rows on or under a parent cycle", async () => {
        await using ecs = createWorld({ [workers]: 0 });
        await ecs.run(spawn);
        await ecs.run(nest);
        await ecs.run(loop);
        ran.length = 0;
        await ecs.run(propagate);
        expect(ran).toEqual(["other"]);
    });

    it("reads parents in several archetypes, including ones the query doesn't match, and null for one without what up reads", async () => {
        await using ecs = createWorld({ [workers]: 0 });
        await ecs.run(spawnMixed);
        await ecs.run(propagateKernel);
        const values = Object.fromEntries(await Promise.all(Object.entries(mixed).map(async ([name, entity]) => [name, await read(ecs, entity, world)])));
        expect(values).toEqual({ root: 1, anchored: 2, unmatched: 50, bare: null, underRoot: 11, underUnmatched: 60, underAnchored: 12, underBare: 10 });
    });

    it("reads a parent's archetype again after it grows", async () => {
        await using ecs = createWorld({ [workers]: 0 });
        await ecs.run(spawnMixed);
        await ecs.run(propagateKernel);
        await ecs.run(growParents);
        await ecs.run(shift);
        await ecs.run(propagateKernel);
        expect(await read(ecs, mixed.underAnchored, world)).toBe(13);
    });

    it("reads a parent the query doesn't match again after it moves to another archetype", async () => {
        await using ecs = createWorld({ [workers]: 0 });
        await ecs.run(spawnMixed);
        await ecs.run(propagateKernel);
        await ecs.run(System.create({}, ({ commands }) => { commands.add(mixed.unmatched, [anchor, world], { [anchor]: true, [world]: 80 }); }));
        await ecs.run(propagateKernel);
        expect(await read(ecs, mixed.underUnmatched, world)).toBe(90);
    });

    it("reads booleans through up", async () => {
        await using ecs = createWorld({ [workers]: 0 });
        const tree: Entity[] = [];
        await ecs.run(System.create({}, ({ commands }) => {
            const top = commands.spawn([visible, shown])({ [visible]: false, [shown]: true });
            tree.push(top, commands.spawn([visible, shown, parent])({ [visible]: true, [shown]: true, [parent]: top }));
            const other = commands.spawn([visible, shown])({ [visible]: true, [shown]: false });
            tree.push(other, commands.spawn([visible, shown, parent])({ [visible]: true, [shown]: false, [parent]: other }));
        }));
        await ecs.run(show);
        expect(await readEach(ecs, tree, shown)).toEqual([false, false, true, true]);
    });

    it("runs as WASM, as JS does", async () => {
        const definition = definitionOf(propagateKernel);
        const description = kernelOf(propagateKernel);
        if (definition === undefined || definition.kind === "composite" || description === undefined) throw new Error("not a compiled leaf");
        expect(bindKernel(createState(), definition, description).wasm).not.toBeNull();
        const results = await Promise.all([true, false].map(async wasm => {
            await using ecs = createWorld({ [workers]: 0 }, { wasm });
            await ecs.run(spawnMixed);
            await ecs.run(propagateKernel);
            await ecs.run(growParents);
            await ecs.run(shift);
            await ecs.run(propagateKernel);
            return await readEach(ecs, Object.values(mixed), world);
        }));
        expect(results[0]).toEqual(results[1]);
    });

    it("rejects a through that isn't a reference, for untyped declarations", async () => {
        // @ts-expect-error through is a reference component
        expect(() => System.create({ components: { write: [world] }, up: { through: local, read: [world] } }, row => { row[world] = 0; })).toThrow('up.through "upTest/local" isn\'t a reference component.');
    });
});
