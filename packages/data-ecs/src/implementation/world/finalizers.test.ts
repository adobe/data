import { describe, expect, it } from "vitest";
import { identify } from "../../interface/registry/ids.test-helper.js";
import { Component } from "../../interface/component/component.js";
import { Entity } from "../../interface/entity/entity.js";
import { Finalizer } from "../../interface/finalizer/finalizer.js";
import { Resource } from "../../interface/resource/resource.js";
import { Rule } from "../../interface/rule/rule.js";
import { System } from "../../interface/system/system.js";
import { createWorld } from "./create.js";
import { count, read, readEach, readResource, select } from "./reads.test-helper.js";
import { workers } from "../../interface/resources/workers.js";
import { reportOf } from "./reports.test-helper.js";

const handle = Symbol("finalizersTest/handle");
const hidden = Symbol("finalizersTest/hidden");
const source = Symbol("finalizersTest/source");
const slot = Symbol("finalizersTest/slot");
const parent = Symbol("finalizersTest/parent");
const label = Symbol("finalizersTest/label");
const released = Symbol("finalizersTest/released");
const late = Symbol("finalizersTest/late");
const level = Symbol("finalizersTest/level");
const written = Symbol("finalizersTest/written");
// Finalizers apply in every world, so each test's finalizers match components of their own.
const counted = Symbol("finalizersTest/counted");
const pendingHandle = Symbol("finalizersTest/pendingHandle");
const respawned = Symbol("finalizersTest/respawned");
const ordered = Symbol("finalizersTest/ordered");
const writing = Symbol("finalizersTest/writing");
const disposing = Symbol("finalizersTest/disposing");
const reloaded = Symbol("finalizersTest/reloaded");

declare module "@adobe/data-ecs" {
    export interface Components {
        [reloaded]: { type: number };
        [handle]: { type: number };
        [hidden]: { type: true };
        [source]: { type: number };
        [slot]: { type: number; derived: true };
        [parent]: { type: Entity; reference: "owner" };
        [label]: { type: string };
        [late]: { type: number };
        [counted]: { type: number };
        [pendingHandle]: { type: number };
        [respawned]: { type: number };
        [ordered]: { type: number };
        [writing]: { type: number };
        [disposing]: { type: number };
    }
    export interface Resources {
        [released]: { type: number };
        [level]: { type: number };
        [written]: { type: number };
    }
}

Component.register(handle, { type: { type: "number" } });
Component.register(hidden, { type: { const: true } });
Component.register(source, { type: { type: "number" } });
Component.register(slot, { type: { type: "number", default: 0 }, derived: true });
Component.register(parent, { type: Entity.schema, reference: "owner" });
Component.register(label, { type: { type: "string" } });
Component.register(late, { type: { type: "number" } });
Resource.register(released, { type: { type: "number", default: 0 } });
Resource.register(level, { type: { type: "number", default: 0 } });
Resource.register(written, { type: { type: "number", default: 0 } });
Component.register(counted, { type: { type: "number" } });
Component.register(pendingHandle, { type: { type: "number" } });
Component.register(respawned, { type: { type: "number" } });
Component.register(ordered, { type: { type: "number" } });
Component.register(writing, { type: { type: "number" } });
Component.register(disposing, { type: { type: "number" } });
Component.register(reloaded, { type: { type: "number" } });

Rule.create({ name: "finalizersTest/slots", components: { has: [source] }, derive: [slot] });

let steps: ((commands: System.Commands) => void)[] = [];
const edit = System.create({ name: "finalizersTest/edit", input: { type: "object", properties: { step: { type: "integer" } } } }, ({ input, commands }) => {
    steps[input.step]?.(commands);
});
const step = (world: ReturnType<typeof createWorld>) => (run: (commands: System.Commands) => void) => {
    steps = [...steps, run];
    return world.run(edit, { step: steps.length - 1 });
};

describe("finalizers", () => {
    it("run for each entity that stops matching, by any cause, reading its values before the sync point applies", async () => {
        const seen: [Entity, number][] = [];
        Finalizer.create({ name: "finalizersTest/release", components: { read: [handle], not: [hidden] } }, row => { seen.push([row.entity, row[handle]]); });
        const world = createWorld({ [workers]: 0 });
        const run = step(world);
        const spawned: Entity[] = [];
        await run(commands => { for (let i = 0; i < 6; i++) spawned.push(commands.spawn([handle])({ [handle]: i * 10 })); });
        const [despawned, removed, excluded, replaced, kept, rewritten] = spawned;
        await run(commands => {
            commands.despawn(despawned);
            commands.remove(removed, handle);
            commands.add(excluded, hidden, true);
            commands.remove(replaced, handle);
            commands.add(replaced, handle, 99);
            commands.add(rewritten, handle, 55);
            // Spawned and despawned at once: it never matched.
            commands.despawn(commands.spawn([handle])({ [handle]: 1 }));
        });
        expect(seen).toEqual([[despawned, 0], [removed, 10], [excluded, 20], [replaced, 30]]);
        expect(await read(world, replaced, handle)).toBe(99);
        expect(await read(world, kept, handle)).toBe(40);
        await world.dispose();
    });

    it("run for rules' and references' removals too, and at disposal for every live match", async () => {
        const seen: number[] = [];
        Finalizer.create({ name: "finalizersTest/slotReleased", components: { read: [slot, source] } }, row => { seen.push(row[source]); });
        const world = createWorld({ [workers]: 0 });
        const run = step(world);
        let root = Entity.none, child = Entity.none;
        await run(commands => {
            root = commands.spawn([source])({ [source]: 1 });
            child = commands.spawn([source, parent])({ [source]: 2, [parent]: root });
            commands.spawn([source])({ [source]: 3 });
        });
        await run(commands => commands.despawn(root));
        expect(seen.sort()).toEqual([1, 2]);
        expect(await read(world, child, source)).toBeNull();
        await world.dispose();
        expect(seen.sort()).toEqual([1, 2, 3]);
    });

    it("write resources at the sync point, queue commands for the next one, and see lookups as they were", async () => {
        const found: (number | null)[] = [];
        Finalizer.create({
            name: "finalizersTest/count",
            components: { read: [counted] },
            lookup: { handles: { read: [counted] } },
            resources: { write: [released] },
        }, (row, { resources, lookup, commands }) => {
            resources[released] += 1;
            found.push(lookup.handles(row.entity)?.[counted] ?? null);
            commands.spawn([label])({ [label]: `after ${row[counted]}` });
        });
        const world = createWorld({ [workers]: 0 });
        const run = step(world);
        let a = Entity.none;
        await run(commands => { a = commands.spawn([counted])({ [counted]: 5 }); });
        await run(commands => commands.despawn(a));
        expect(found).toEqual([5]);
        expect(await readResource(world, released)).toBe(1);
        expect(await count(world, { required: [label] })).toBe(0);
        await run(() => {});
        expect(await count(world, { required: [label] })).toBe(1);
        await world.dispose();
    });

    it("leave their commands for the next run's sync point, even when that run first adds resources", async () => {
        let other = Entity.none;
        Finalizer.create({ name: "finalizersTest/pending", components: { read: [pendingHandle] } }, (_, { commands }) => { commands.despawn(other); });
        const reads = System.create({ name: "finalizersTest/reads", resources: { read: [level] } }, ({ resources }) => { void resources[level]; });
        // Read after every run, as a read through a run of its own would apply the commands left for it.
        let seen: string | null = null;
        const watch = System.create({ name: "finalizersTest/watchOther", observer: true, lookup: { labels: { read: [label] } } }, ({ lookup }) => {
            seen = lookup.labels(other)?.[label] ?? null;
        });
        const world = createWorld({ [workers]: 0 });
        world.add(watch);
        const run = step(world);
        let a = Entity.none;
        await run(commands => { a = commands.spawn([pendingHandle])({ [pendingHandle]: 1 }); other = commands.spawn([label])({ [label]: "other" }); });
        await run(commands => commands.despawn(a));
        expect(seen).toBe("other");
        await world.run(reads);
        expect(seen).toBeNull();
        await world.dispose();
    });

    it("keep reservations they make apart from the indexes their sync point frees", async () => {
        Finalizer.create({ name: "finalizersTest/respawn", components: { read: [respawned] } }, (row, { commands }) => {
            commands.spawn([respawned])({ [respawned]: row[respawned] + 100 });
        });
        const world = createWorld({ [workers]: 0 });
        const run = step(world);
        const first: Entity[] = [];
        await run(commands => { for (let i = 0; i < 8; i++) first.push(commands.spawn([respawned])({ [respawned]: i })); });
        await run(commands => { for (const entity of first) commands.despawn(entity); });
        await run(commands => { for (let i = 0; i < 8; i++) commands.spawn([respawned])({ [respawned]: 1000 + i }); });
        const live = await select(world, { required: [respawned] });
        expect(new Set(live).size).toBe(16);
        expect((await readEach(world, live, respawned)).sort((x, y) => (x ?? 0) - (y ?? 0)))
            .toEqual([100, 101, 102, 103, 104, 105, 106, 107, 1000, 1001, 1002, 1003, 1004, 1005, 1006, 1007]);
        await world.dispose();
    });

    it("run in their order, and a throw still applies the sync point and is reported", async () => {
        const order: string[] = [];
        const second = Finalizer.create({ name: "finalizersTest/second", components: { read: [ordered] } }, () => { order.push("second"); });
        Finalizer.create({ name: "finalizersTest/first", components: { read: [ordered] }, before: [second] }, () => { order.push("first"); });
        Finalizer.create({ name: "finalizersTest/throws", components: { read: [ordered] } }, () => { throw new Error("finalizer failed"); });
        const world = createWorld({ [workers]: 0 });
        const run = step(world);
        let a = Entity.none;
        await run(commands => { a = commands.spawn([ordered])({ [ordered]: 1 }); });
        const { failures } = await reportOf(world, await run(commands => commands.despawn(a)));
        expect(failures.map(({ kind, name, message }) => ({ kind, name, message }))).toEqual([{ kind: "finalizer", name: "finalizersTest/throws", message: "finalizer failed" }]);
        expect(order).toEqual(["first", "second"]);
        expect(await read(world, a, handle)).toBeNull();
        const writer = (name: "finalizersTest/writerA" | "finalizersTest/writerB") =>
            Finalizer.create({ name, components: { read: [writing] }, resources: { write: [written] } }, (_, { resources }) => { resources[written] = 1; });
        writer("finalizersTest/writerA");
        expect(() => writer("finalizersTest/writerB")).toThrow("order them with before or after");
        await world.dispose();
    });
});

describe("a finalizer declared again the same, as a module evaluated again declares it", () => {
    it("keeps its place in each world, and runs its new body once", async () => {
        const seen: string[] = [];
        const first = Finalizer.create(identify({ name: "finalizersTest/reloaded", components: { read: [reloaded] } }, "finalizersTest/finalizers.ts#reloaded"), () => { seen.push("first"); });
        const world = createWorld({ [workers]: 0 });
        let entity = Entity.none;
        await step(world)(commands => { entity = commands.spawn([reloaded])({ [reloaded]: 1 }); });
        const again = Finalizer.create(identify({ name: "finalizersTest/reloaded", components: { read: [reloaded] } }, "finalizersTest/finalizers.ts#reloaded"), () => { seen.push("again"); });
        expect(again).toBe(first);
        await step(world)(commands => { commands.despawn(entity); });
        expect(seen).toEqual(["again"]);
        expect(() => Finalizer.create(identify({ name: "finalizersTest/reloaded", components: { read: [handle] } }, "finalizersTest/finalizers.ts#reloaded"), () => {})).toThrow("reload the page");
        await world.dispose();
    });
});

describe("a finalizer created after a world has entities it matches", () => {
    it("releases them at disposal", async () => {
        const world = createWorld({ [workers]: 0 });
        await step(world)(commands => { commands.spawn([disposing])({ [disposing]: 4 }); });
        const seen: number[] = [];
        Finalizer.create({ name: "finalizersTest/late", components: { read: [disposing] }, resources: { read: [level] } }, row => { seen.push(row[disposing]); });
        await world.dispose();
        expect(seen).toEqual([4]);
    });
});

describe("changes finalizers", () => {
    it("watch by default every component that isn't derived, including ones first used later, and no resources", async () => {
        const seen: unknown[] = [];
        Finalizer.changes({ name: "finalizersTest/everything", resources: { read: [level] } }, (changes, { resources }) => {
            void resources[level];
            for (const group of changes.groups) seen.push(group.to);
        });
        const world = createWorld({ [workers]: 0 });
        await step(world)(commands => { commands.spawn([late])({ [late]: 1 }); });
        expect(seen).toEqual([[late]]);
        await world.dispose();
    });

    it("see each sync point's structural changes to their components, grouped, with values before and after", async () => {
        const groups: unknown[] = [];
        const values: unknown[] = [];
        Finalizer.changes({ name: "finalizersTest/changes", watch: [handle, label] }, ({ groups: seen, previous, next }) => {
            for (const group of seen) {
                groups.push({ ...group, entities: group.entities.length });
                for (const entity of group.entities) values.push([previous(entity, handle), next(entity, handle)]);
            }
        });
        const world = createWorld({ [workers]: 0 });
        const run = step(world);
        let a = Entity.none, b = Entity.none;
        await run(commands => { a = commands.spawn([handle])({ [handle]: 1 }); b = commands.spawn([handle, label])({ [handle]: 2, [label]: "b" }); commands.spawn([hidden])({ [hidden]: true }); });
        expect(groups).toEqual([
            { from: null, to: [handle], added: [handle], removed: [], replaced: [], entities: 1 },
            { from: null, to: [handle, label], added: [handle, label], removed: [], replaced: [], entities: 1 },
        ]);
        expect(values).toEqual([[null, 1], [null, 2]]);
        groups.length = values.length = 0;
        await run(commands => { commands.add(a, [label, handle], { [label]: "a", [handle]: 3 }); commands.despawn(b); commands.add(a, hidden, true); });
        expect(groups).toEqual([
            { from: [handle], to: [handle, label], added: [label], removed: [], replaced: [], entities: 1 },
            { from: [handle, label], to: null, added: [], removed: [handle, label], replaced: [], entities: 1 },
        ]);
        expect(values).toEqual([[1, 3], [2, null]]);
        await world.dispose();
    });
});
