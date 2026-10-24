// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { giveAccess } from "../../interface/registry/ids.test-helper.js";
import { identify } from "../../interface/registry/ids.test-helper.js";
import { Entity } from "../../interface/entity/entity.js";
import { gpuDevice } from "../../interface/resources/gpu-device.js";
import { System } from "../../interface/system/system.js";
import { count, read, readEach, readEntity, readResource, select } from "./reads.test-helper.js";
import { World } from "../../interface/world/world.js";
import { attachKernel } from "./attach-kernel.js";
import { createWorld } from "../index.js";
import { fillReports, reportOf, runReported } from "./reports.test-helper.js";
import { Report } from "../../interface/report/report.js";
import type { Schema } from "../../interface/schema/schema.js";

type Vec2 = readonly [number, number];

const position = Symbol("createTest/position");
const velocity = Symbol("createTest/velocity");
const label = Symbol("createTest/label");
const frozen = Symbol("createTest/frozen");
const spawnCount = Symbol("createTest/spawnCount");
const seen = Symbol("createTest/seen");
const marker = Symbol("createTest/marker");

declare module "@adobe/ecs" {
    export interface Components {
        [position]: { type: readonly [number, number] };
        [velocity]: { type: number };
        [label]: { type: string };
        [frozen]: { type: true };
        [marker]: { type: number };
    }
    export interface Resources {
        [spawnCount]: { type: Schema.Type<{ type: "integer" }>; default: 3 };
        [seen]: { type: Schema.Type<{ type: "integer" }>; default: 0 };
    }
}


const spawn = System.create({
    resources: { changed: [spawnCount] },
}, ({ resources, commands }) => {
    for (let i = 0; i < resources[spawnCount]; i++) commands.spawn([position, velocity, label])({ [position]: [i, 0], [velocity]: 1, [label]: `e${i}` });
});

const move = System.create({
    components: { with: [velocity, position], not: [frozen] },
    after: [spawn],
}, row => {
    const [x, y] = row[position];
    row[position] = [x, y + row[velocity]];
});

/** Counts rows whose position may have changed since it last ran. */
const watch = System.create({
    components: { changed: [position] },
    after: [move],
}, (_, { resources }) => {
    resources[seen] += 1;
});

/** A kernel whose module can't be imported. */
const missing = attachKernel(
    System.create({ kernel: true, components: { with: [velocity] } }, () => {}),
    { columns: [], shapes: [], resources: [], lookups: [], keys: [], spawns: [], structuredValues: [], url: "/@missing/kernel.js", program: null, reductions: [], reducedShapes: [] },
);

const main = System.create({ systems: [spawn, move, watch] });

const positions = async (world: World): Promise<Vec2[]> =>
    (await readEach(world, await select(world, { required: [position], order: { [position]: true } }), position)).map(value => value ?? [NaN, NaN]);

describe("World.create", () => {
    it("spawns once from a changed resource, then integrates", async () => {
        const world = createWorld();
        await world.run(main);
        expect(await positions(world)).toEqual([[0, 0], [1, 0], [2, 0]]);
        await world.run(main);
        expect(await positions(world)).toEqual([[0, 1], [1, 1], [2, 1]]);
        expect(await readResource(world, spawnCount)).toBe(3);
    });

    it("reports each change to a system exactly once", async () => {
        const world = createWorld();
        await world.run(main);
        // Spawned at the sync point, after watch ran: seen on the next run.
        expect(await readResource(world, seen)).toBe(0);
        await world.run(main);
        expect(await readResource(world, seen)).toBe(3);
        // Moved before watch in the last run, so already reported.
        await world.run(watch);
        expect(await readResource(world, seen)).toBe(3);
        await world.run(move);
        await world.run(watch);
        expect(await readResource(world, seen)).toBe(6);
    });

    it("applies the net structural change of a sync point", async () => {
        let first = Entity.none;
        let second = Entity.none;
        const edit = System.create({}, ({ commands }, input: { readonly action: string }) => {
            if (input.action === "spawn") {
                first = commands.spawn([velocity])({ [velocity]: 1 });
                second = commands.spawn([velocity])({ [velocity]: 2 });
            }
            if (input.action === "toggle") {
                commands.add(first, frozen, true);
                commands.remove(first, frozen);
                commands.add(second, [velocity, label], { [velocity]: 5, [label]: "second" });
                commands.despawn(first);
                commands.add(first, label, "dead");
            }
        });
        const world = createWorld();
        await world.run(edit, { action: "spawn" });
        expect(await count(world, { required: [velocity] })).toBe(2);
        await world.run(edit, { action: "toggle" });
        expect(await readEntity(world, first, [velocity])).toBeNull();
        expect(await readEntity(world, second, [velocity, label])).toEqual({ [velocity]: 5, [label]: "second" });
        expect(await select(world, { required: [velocity] })).toEqual([second]);
    });

    it("reuses a despawned index only after a sync point, with a new generation", async () => {
        const spawned: Entity[] = [];
        const edit = System.create({}, ({ commands }, input: { readonly action: string }) => {
            if (input.action === "spawn") spawned.push(commands.spawn([velocity])({ [velocity]: spawned.length }));
            else for (const entity of spawned) commands.despawn(entity);
        });
        const world = createWorld();
        // Past the runs that spawn reports, whose entities would take the freed index first.
        await fillReports(world);
        await world.run(edit, { action: "spawn" });
        await world.run(edit, { action: "despawn" });
        await world.run(edit, { action: "spawn" });
        const [old, reused] = spawned;
        expect(reused >>> 0).toBe(old >>> 0);
        expect(reused).not.toBe(old);
        expect(await read(world, old, velocity)).toBeNull();
        expect(await read(world, reused, velocity)).toBe(1);
    });

    it("keeps rows consistent across swap-removes and archetype growth", async () => {
        const spawned: Entity[] = [];
        const edit = System.create({}, ({ commands }, input: { readonly action: string }) => {
            if (input.action === "spawn") for (let i = 0; i < 100; i++) spawned.push(commands.spawn([velocity, label])({ [velocity]: i, [label]: `${i}` }));
            else for (let i = 0; i < 100; i += 3) commands.remove(spawned[i], label);
        });
        const world = createWorld();
        await world.run(edit, { action: "spawn" });
        await world.run(edit, { action: "remove" });
        for (const [i, entity] of spawned.entries()) {
            expect(await read(world, entity, velocity)).toBe(i);
            expect(await read(world, entity, label)).toBe(i % 3 === 0 ? null : `${i}`);
        }
        expect(await count(world, { required: [label] })).toBe(66);
    });

    it("reads a component the world had no id for at an earlier read, once it has one", async () => {
        await using world = createWorld();
        const spawnPlain = System.create({}, ({ commands }) => { commands.spawn([velocity])({ [velocity]: 1 }); });
        await world.run(spawnPlain);
        const [entity] = await select(world, { required: [velocity] });
        expect(await read(world, entity, frozen)).toBe(null);
        const freeze = System.create({}, ({ commands }, input: { readonly entity: Entity }) => {
            commands.add(input.entity, frozen, true);
        });
        await world.run(freeze, { entity });
        expect(await read(world, entity, frozen)).toBe(true);
    });

    it("hides the resource entity from queries and commands", async () => {
        const edit = System.create({ components: {} }, (row, { commands }) => {
            commands.despawn(row.entity);
        });
        const world = createWorld();
        expect(await count(world, { required: [] })).toBe(0);
        await world.run(edit);
        expect(await readResource(world, seen)).toBe(0);
    });

    it("throws at creating a composite with an unordered conflict, naming nothing", () => {
        const push = System.create({ components: { with: [position] } }, row => { row[position] = [0, 0]; });
        expect(() => System.create({ systems: [move, push] })).toThrow('"move" and "push"');
        expect(() => System.create({ systems: [move] })).not.toThrow();
    });

    it("gives a body's context only the kinds its body uses", async () => {
        let keys: string[] = [];
        // It passes its context on, so the build can't follow it, and it's given what it reads.
        const probe = System.create(giveAccess({}, { resources: { read: [seen] } }), context => {
            keys = Object.keys(context);
            void context.resources[seen];
        });
        const world = createWorld();
        await world.run(probe);
        expect(keys).toEqual(["resources", "commands"]);
    });

    it("reports a system that throws, still applying its commands", async () => {
        const fail = System.create({}, ({ commands }) => {
            commands.spawn([velocity])({ [velocity]: 1 });
            throw new Error("boom");
        });
        const world = createWorld();
        const [failure] = (await runReported(world, fail)).failures;
        expect([failure.kind, failure.name, failure.message]).toEqual(["system", "fail", "boom"]);
        expect(failure.stack).toContain("boom");
        expect(await count(world, { required: [velocity] })).toBe(1);
    });

    it("gives every run a report, with no errors for runs with nothing to report", async () => {
        const quiet = System.create({}, () => {});
        await using world = createWorld();
        const first = await world.run(quiet);
        expect(await world.run(quiet)).toBe(first + 1);
        expect(await reportOf(world, first)).toEqual({ failures: [], skipped: [], dropped: 0, warnings: [] });
        expect(await count(world, { required: [Report.errors] })).toBe(0);
        expect(await count(world, { required: [Report.run] })).toBeGreaterThanOrEqual(2);
    });

    it("reports what isn't an Error as text, without a stack", async () => {
        const fail = System.create({}, () => {
            // A value that isn't an Error, which user code may throw.
            throw { code: 7 };
        });
        await using world = createWorld();
        expect((await runReported(world, fail)).failures).toEqual([{ kind: "system", name: "fail", id: null, message: "[object Object]", stack: null }]);
    });

    it("reports the systems a failed tier skips, and the commands that did nothing", async () => {
        const doomed = System.create({}, ({ commands }) => {
            const entity = commands.spawn([velocity])({ [velocity]: 1 });
            commands.despawn(entity);
            commands.add(entity, frozen, true);
            commands.despawn(entity);
        });
        const fails = System.create({}, () => { throw new Error("first"); });
        const later = System.create({ after: [fails] }, () => {});
        await using world = createWorld();
        expect(await runReported(world, doomed)).toEqual({ failures: [], skipped: [], dropped: 2, warnings: [] });
        const report = await runReported(world, System.create({ systems: [fails, later] }));
        expect(report.skipped).toEqual(["later"]);
        expect(report.failures.map(failure => failure.name)).toEqual(["fails"]);
    });

    it("skips every row when a system's only filter is an unchanged resource", async () => {
        const count = System.create({
            components: { with: [velocity] },
            resources: { changed: [spawnCount] },
        }, (_, { resources }) => {
            resources[seen] += 1;
        });
        const world = createWorld();
        await world.run(spawn);
        await world.run(count);
        expect(await readResource(world, seen)).toBe(3);
        await world.run(count);
        expect(await readResource(world, seen)).toBe(3);
    });

    it("doesn't let a lookup match the resource entity", async () => {
        let found: object | null | undefined;
        const probe = System.create({ lookup: { any: {} } }, ({ lookup: { any } }) => {
            // The resource entity is entity 1, since index 0 is never an entity and registration reserves the next first.
            // @ts-expect-error an untyped caller can pass any number
            found = any(1);
        });
        const world = createWorld();
        await world.run(probe);
        expect(found).toBeNull();
    });

    it("undoes a registration whose kernels fail to load, so the next run tries again", async () => {
        const world = createWorld();
        await expect(world.run(missing)).rejects.toThrow();
        await expect(world.run(missing)).rejects.toThrow();
        await world.run(spawn);
    });

    it("sees a change moved into an older chunk by a swap-remove", async () => {
        const spawned: Entity[] = [];
        const edit = System.create({}, ({ commands }, input: { readonly action: string }) => {
            if (input.action === "spawn") for (let i = 0; i < 2100; i++) spawned.push(commands.spawn([velocity])({ [velocity]: i }));
            else commands.despawn(spawned[5]);
        });
        const writer = System.create({ components: { with: [velocity] } }, row => {
            if (row[velocity] === 2099) row[velocity] = -1;
        });
        const changes: number[] = [];
        const observer = System.create({ components: { with: [velocity], changed: [velocity] } }, row => {
            changes.push(row[velocity]);
        });
        const world = createWorld();
        await world.run(edit, { action: "spawn" });
        await world.run(observer);
        changes.length = 0;
        // The last row (in the third chunk) changes; then a despawn moves it into row 5, in the first chunk.
        await world.run(writer);
        await world.run(edit, { action: "despawn" });
        await world.run(observer);
        expect(changes).toEqual([-1]);
    });

    it("selects with where and order", async () => {
        const edit = System.create({}, ({ commands }) => {
            for (let i = 0; i < 10; i++) commands.spawn([position, velocity])({ [position]: [i % 3, i], [velocity]: i });
        });
        const world = createWorld();
        await world.run(edit);
        const velocities = async (entities: Promise<readonly Entity[]>): Promise<(number | null)[]> => readEach(world, await entities, velocity);
        expect(await velocities(select(world, { required: [velocity], where: { [velocity]: { "<": 3 } } }))).toEqual([0, 1, 2]);
        expect(await velocities(select(world, { required: [velocity], where: { [velocity]: { ">=": 2, "!=": 4, "<": 6 } } }))).toEqual([2, 3, 5]);
        expect(await velocities(select(world, { required: [position, velocity], where: { [position]: [1, 4] } }))).toEqual([4]);
        expect(await velocities(select(world, { required: [velocity], order: { [velocity]: false } }))).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
        expect(await velocities(select(world, { required: [position, velocity], where: { [velocity]: { ">": 1 } }, order: { [position]: true } })))
            .toEqual([3, 6, 9, 4, 7, 2, 5, 8]);
        expect(await count(world, { required: [velocity], where: { [velocity]: { "<": 3 } } })).toBe(3);
    });

    it("spawns components named by symbols", async () => {
        let spawned = Entity.none;
        const edit = System.create({}, ({ commands }) => {
            spawned = commands.spawn([velocity, marker])({ [velocity]: 2, [marker]: 7 });
        });
        const world = createWorld();
        await world.run(edit);
        expect(await readEntity(world, spawned, [velocity, marker])).toEqual({ [velocity]: 2, [marker]: 7 });
    });

    it("starts resources at values given at creation, in place of their defaults", async () => {
        const world = createWorld({ [spawnCount]: 2 });
        expect(await readResource(world, spawnCount)).toBe(2);
        await world.run(spawn);
        expect(await count(world, { required: [velocity] })).toBe(2);
        expect(await readResource(createWorld(), spawnCount)).toBe(3);
        // @ts-expect-error resources takes only resource names
        expect(() => createWorld({ [velocity]: 1 })).toThrow(`"createTest/velocity" isn't a registered resource`);
        // A string key is never a resource's, so it's ignored, as in commands.
        const untyped: World = Reflect.apply(createWorld, undefined, [{ "createTest/spawnCount": 5, [spawnCount]: 2 }]);
        expect(await readResource(untyped, spawnCount)).toBe(2);
    });

    it("has the gpuDevice resource, null without a device", async () => {
        await using world = createWorld();
        expect(await readResource(world, gpuDevice)).toBeNull();
        let seen: unknown = undefined;
        await world.run(System.create({}, ({ resources }) => { seen = resources[gpuDevice]; }));
        expect(seen).toBeNull();
    });

    it("accepts a system declared again the same under its id, as a module evaluated again declares it, and rejects a different one", async () => {
        const first = System.create(identify({  }, "createTest/systems.ts#named"), ({ resources }) => { resources[seen] = 1; });
        const again = System.create(identify({  }, "createTest/systems.ts#named"), ({ resources }) => { resources[seen] = 2; });
        expect(() => System.create(identify({}, "createTest/systems.ts#named"), () => {})).toThrow('Cannot declare "named" (createTest/systems.ts#named): its id is another item\'s, with another declaration; if a module was evaluated again with a changed declaration, reload the page.');
        await using world = createWorld();
        await world.run(first);
        await world.run(again);
        expect(await readResource(world, seen)).toBe(2);
    });

    it("refuses runs as soon as dispose is called", async () => {
        const world = createWorld();
        void world.dispose();
        await expect(world.run(main)).rejects.toThrow("disposed");
    });
});
