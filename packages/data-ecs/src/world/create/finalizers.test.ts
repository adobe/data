import { describe, expect, it } from "vitest";
import { Component } from "../../component/component.js";
import { Entity } from "../../entity/entity.js";
import { Finalizer } from "../../finalizer/finalizer.js";
import { Resource } from "../../resource/resource.js";
import { Rule } from "../../rule/rule.js";
import { System } from "../../system/system.js";
import { createWorld } from "./create.js";

const handle = "finalizersTest/handle";
const hidden = "finalizersTest/hidden";
const source = "finalizersTest/source";
const slot = "finalizersTest/slot";
const parent = "finalizersTest/parent";
const label = "finalizersTest/label";
const released = "finalizersTest/released";
const late = "finalizersTest/late";
const level = "finalizersTest/level";

declare module "@adobe/data-ecs" {
    export interface Components {
        [handle]: { type: number };
        [hidden]: { type: true };
        [source]: { type: number };
        [slot]: { type: number; derived: true };
        [parent]: { type: Entity; reference: "owner" };
        [label]: { type: string };
        [late]: { type: number };
    }
    export interface Resources {
        [released]: { type: number };
        [level]: { type: number };
    }
    export interface Rules {
        "finalizersTest/slots": true;
    }
    export interface Finalizers {
        "finalizersTest/release": true;
        "finalizersTest/slotReleased": true;
        "finalizersTest/count": true;
        "finalizersTest/respawn": true;
        "finalizersTest/throws": true;
        "finalizersTest/changes": true;
        "finalizersTest/first": true;
        "finalizersTest/second": true;
        "finalizersTest/everything": true;
        "finalizersTest/pending": true;
    }
    export interface Systems {
        "finalizersTest/edit": true;
        "finalizersTest/reads": true;
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

const slots = Rule.create({ name: "finalizersTest/slots", query: { has: [source] }, derives: [slot] });

let steps: ((commands: System.Commands) => void)[] = [];
const edit = System.create({ name: "finalizersTest/edit", args: { type: "integer" } }, (_, { args }, commands) => { steps[args]?.(commands); });
const step = (world: ReturnType<typeof createWorld>) => async (run: (commands: System.Commands) => void) => {
    steps = [...steps, run];
    await world.run(edit, steps.length - 1);
};

describe("finalizers", () => {
    it("run for each entity that stops matching, by any cause, reading its values before the sync point applies", async () => {
        const seen: [Entity, number][] = [];
        const release = Finalizer.create({ name: "finalizersTest/release", query: { read: [handle], not: [hidden] } }, row => { seen.push([row.entity, row[handle]]); });
        const world = createWorld({ workers: 0 });
        await world.systems.register(edit, release);
        const run = step(world);
        const spawned: Entity[] = [];
        await run(commands => { for (let i = 0; i < 6; i++) spawned.push(commands.spawn({ [handle]: i * 10 })); });
        const [despawned, removed, excluded, replaced, kept, rewritten] = spawned;
        await run(commands => {
            commands.despawn(despawned);
            commands.remove(removed, handle);
            commands.add(excluded, { [hidden]: true });
            commands.remove(replaced, handle);
            commands.add(replaced, { [handle]: 99 });
            commands.add(rewritten, { [handle]: 55 });
            // Spawned and despawned at once: it never matched.
            commands.despawn(commands.spawn({ [handle]: 1 }));
        });
        expect(seen).toEqual([[despawned, 0], [removed, 10], [excluded, 20], [replaced, 30]]);
        expect(world.read.component(replaced, handle)).toBe(99);
        expect(world.read.component(kept, handle)).toBe(40);
        await world.dispose();
    });

    it("run for rules' and references' removals too, and at disposal for every live match", async () => {
        const seen: number[] = [];
        const release = Finalizer.create({ name: "finalizersTest/slotReleased", query: { read: [slot, source] } }, row => { seen.push(row[source]); });
        const world = createWorld({ workers: 0 });
        await world.systems.register(edit, slots, release);
        const run = step(world);
        let root = Entity.none, child = Entity.none;
        await run(commands => {
            root = commands.spawn({ [source]: 1 });
            child = commands.spawn({ [source]: 2, [parent]: root });
            commands.spawn({ [source]: 3 });
        });
        await run(commands => commands.despawn(root));
        expect(seen.sort()).toEqual([1, 2]);
        expect(world.read.component(child, source)).toBeNull();
        await world.dispose();
        expect(seen.sort()).toEqual([1, 2, 3]);
    });

    it("write resources at the sync point, queue commands for the next one, and see lookups as they were", async () => {
        const found: (number | null)[] = [];
        const count = Finalizer.create({
            name: "finalizersTest/count",
            query: { read: [handle] },
            lookup: { handles: { read: [handle] } },
            resources: { read: [released], write: [released] },
        }, (row, context, commands) => {
            context[released] += 1;
            found.push(context.handles(row.entity)?.[handle] ?? null);
            commands.spawn({ [label]: `after ${row[handle]}` });
        });
        const world = createWorld({ workers: 0 });
        await world.systems.register(edit, count);
        const run = step(world);
        let a = Entity.none;
        await run(commands => { a = commands.spawn({ [handle]: 5 }); });
        await run(commands => commands.despawn(a));
        expect(found).toEqual([5]);
        expect(world.read.resource(released)).toBe(1);
        expect(world.query.count([label])).toBe(0);
        await run(() => {});
        expect(world.query.count([label])).toBe(1);
        await world.dispose();
    });

    it("leave their commands for the next run when a registration adds resources in between", async () => {
        let other = Entity.none;
        const pending = Finalizer.create({ name: "finalizersTest/pending", query: { read: [handle] } }, (_, __, commands) => { commands.despawn(other); });
        const world = createWorld({ workers: 0 });
        await world.systems.register(edit, pending);
        const run = step(world);
        let a = Entity.none;
        await run(commands => { a = commands.spawn({ [handle]: 1 }); other = commands.spawn({ [label]: "other" }); });
        await run(commands => commands.despawn(a));
        await world.systems.register(System.create({ name: "finalizersTest/reads", resources: { read: [level] } }, (_, context) => { void context[level]; }));
        expect(world.read.component(other, label)).toBe("other");
        await run(() => {});
        expect(world.read.component(other, label)).toBeNull();
        await world.dispose();
    });

    it("keep reservations they make apart from the indexes their sync point frees", async () => {
        const respawn = Finalizer.create({ name: "finalizersTest/respawn", query: { read: [handle] } }, (row, _, commands) => {
            commands.spawn({ [handle]: row[handle] + 100 });
        });
        const world = createWorld({ workers: 0 });
        await world.systems.register(edit, respawn);
        const run = step(world);
        const first: Entity[] = [];
        await run(commands => { for (let i = 0; i < 8; i++) first.push(commands.spawn({ [handle]: i })); });
        await run(commands => { for (const entity of first) commands.despawn(entity); });
        await run(commands => { for (let i = 0; i < 8; i++) commands.spawn({ [handle]: 1000 + i }); });
        const live = world.query.select([handle]);
        expect(new Set(live).size).toBe(16);
        expect(live.map(entity => world.read.component(entity, handle)).sort((x, y) => (x ?? 0) - (y ?? 0)))
            .toEqual([100, 101, 102, 103, 104, 105, 106, 107, 1000, 1001, 1002, 1003, 1004, 1005, 1006, 1007]);
        await world.dispose();
    });

    it("run in their order, and a throw still applies the sync point, then rejects the run", async () => {
        const order: string[] = [];
        const second = Finalizer.create({ name: "finalizersTest/second", query: { read: [handle] }, after: ["finalizersTest/first"] }, () => { order.push("second"); });
        const first = Finalizer.create({ name: "finalizersTest/first", query: { read: [handle] } }, () => { order.push("first"); });
        const throws = Finalizer.create({ name: "finalizersTest/throws", query: { read: [handle] } }, () => { throw new Error("finalizer failed"); });
        const world = createWorld({ workers: 0 });
        await world.systems.register(edit, second, first, throws);
        const run = step(world);
        let a = Entity.none;
        await run(commands => { a = commands.spawn({ [handle]: 1 }); });
        await expect(run(commands => commands.despawn(a))).rejects.toThrow("finalizer failed");
        expect(order).toEqual(["first", "second"]);
        expect(world.read.component(a, handle)).toBeNull();
        const writer = (name: "finalizersTest/first" | "finalizersTest/second") =>
            Finalizer.create({ name, query: { read: [handle] }, resources: { write: [released] } }, (_, context) => { context[released] = 1; });
        await expect(createWorld({ workers: 0 }).systems.register(writer("finalizersTest/first"), writer("finalizersTest/second"))).rejects.toThrow("order them with before or after");
        await world.dispose();
    });
});

describe("changes finalizers", () => {
    it("watch by default every component that isn't derived, including ones first used later, and no resources", async () => {
        const seen: unknown[] = [];
        const everything = Finalizer.changes({ name: "finalizersTest/everything", resources: { read: [released] } }, (changes, context) => {
            void context[released];
            for (const group of changes.groups) seen.push(group.to);
        });
        const world = createWorld({ workers: 0 });
        await world.systems.register(edit, everything);
        await step(world)(commands => { commands.spawn({ [late]: 1 }); });
        expect(seen).toEqual([[late]]);
        await world.dispose();
    });

    it("see each sync point's structural changes to their components, grouped, with values before and after", async () => {
        const groups: unknown[] = [];
        const values: unknown[] = [];
        const changes = Finalizer.changes({ name: "finalizersTest/changes", components: [handle, label] }, ({ groups: seen, previous, next }) => {
            for (const group of seen) {
                groups.push({ ...group, entities: group.entities.length });
                for (const entity of group.entities) values.push([previous(entity, handle), next(entity, handle)]);
            }
        });
        const world = createWorld({ workers: 0 });
        await world.systems.register(edit, changes);
        const run = step(world);
        let a = Entity.none, b = Entity.none;
        await run(commands => { a = commands.spawn({ [handle]: 1 }); b = commands.spawn({ [handle]: 2, [label]: "b" }); commands.spawn({ [hidden]: true }); });
        expect(groups).toEqual([
            { from: null, to: [handle], added: [handle], removed: [], replaced: [], entities: 1 },
            { from: null, to: [handle, label], added: [handle, label], removed: [], replaced: [], entities: 1 },
        ]);
        expect(values).toEqual([[null, 1], [null, 2]]);
        groups.length = values.length = 0;
        await run(commands => { commands.add(a, { [label]: "a", [handle]: 3 }); commands.despawn(b); commands.add(a, { [hidden]: true }); });
        expect(groups).toEqual([
            { from: [handle], to: [handle, label], added: [label], removed: [], replaced: [], entities: 1 },
            { from: [handle, label], to: null, added: [], removed: [handle, label], replaced: [], entities: 1 },
        ]);
        expect(values).toEqual([[1, 3], [2, null]]);
        await world.dispose();
    });
});
