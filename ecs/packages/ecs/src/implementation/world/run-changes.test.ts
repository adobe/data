// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect, it } from "vitest";
import { Entity, System } from "../../index.js";
import { createWorld } from "../index.js";
import type { Tables } from "../../interface/system/tables.js";
import type { Table } from "../../interface/world/table/table.js";

const name = Symbol("runChanges/name");
const score = Symbol("runChanges/score");
const spent = Symbol("runChanges/spent");
const echo = Symbol("runChanges/echo");
const budget = Symbol("runChanges/budget");

declare module "@adobe/ecs" {
    interface Components {
        [name]: { type: string };
        [score]: { type: number };
        [spent]: { type: true };
        [echo]: { type: string };
    }
    interface Resources {
        [budget]: { type: number; default: 10 };
    }
}

// An entity spent leaves an echo, which its finalizer spawns at the next sync point.
System.removed({ components: { with: [name, spent] } }, (row, { commands }) => { commands.spawn([echo])({ [echo]: row[name] }); });

const spawn = System.create({}, ({ commands }, input: { readonly who: string }) => { commands.spawn([name])({ [name]: input.who }); });
const score10 = System.create({ components: { with: [name], not: [score] }, after: [spawn] }, (row, { commands }) => { commands.add(row.entity, score, 10); });
const enter = System.create([spawn, score10]);
const rescore = System.create({ components: { with: [score] } }, (row, { commands }) => { commands.add(row.entity, score, row[score] + 1); });
const spend = System.create({ components: { with: [name] } }, (row, { commands, resources }) => {
    commands.add(row.entity, spent);
    commands.despawn(row.entity);
    resources[budget] -= 1;
});
const raise = System.create({}, ({ resources }) => { resources[budget] = resources[budget]; });
const readNamed = System.create({ readonly: true, tables: { components: [name] } }, ({ tables }): Tables => tables);
const copied: { tables: readonly Table[] } = { tables: [] };
const copy = System.create(({ commands }) => { commands.spawnTables(copied.tables); });
const clear = System.create(({ commands }) => { commands.despawnWhere({ with: [name] }); });

const describe = (changes: Awaited<ReturnType<typeof run>>) => changes.groups.map(group => ({
    from: group.from?.map(key => key.description) ?? null, to: group.to?.map(key => key.description) ?? null,
    replaced: group.replaced.map(key => key.description),
    values: group.entities.map(entity => [changes.previous(entity, score), changes.next(entity, score), changes.previous(entity, name) ?? changes.next(entity, name)]),
}));
const run = (world: ReturnType<typeof createWorld>) => world.run(rescore, { changes: true });

it("resolves to the run's own changes, merged across its sync points, with values before and after it", async () => {
    await using world = createWorld();
    const entered = await world.run(enter, { who: "ada" }, { changes: true });
    expect(describe(entered)).toEqual([{ from: null, to: ["runChanges/name", "runChanges/score"], replaced: [], values: [[null, 10, "ada"]] }]);
    expect(entered.resources).toEqual([]);
    expect(describe(await run(world))).toEqual([{ from: ["runChanges/name", "runChanges/score"], to: ["runChanges/name", "runChanges/score"], replaced: ["runChanges/score"], values: [[10, 11, "ada"]] }]);
});

it("leaves out what finalizers of an earlier sync point queued, and gives what its systems wrote of resources", async () => {
    await using world = createWorld();
    await world.run(enter, { who: "bo" });
    // Its finalizer queues an echo for the next sync point, which applies before the next run's own changes.
    const spent = await world.run(spend, { changes: true });
    expect(describe(spent)).toEqual([{ from: ["runChanges/name", "runChanges/score"], to: null, replaced: [], values: [[10, null, "bo"]] }]);
    expect(spent.resources).toEqual([{ key: budget, previous: 10, next: 9 }]);
    const raised = await world.run(raise, { changes: true });
    expect([raised.groups, raised.resources]).toEqual([[], []]);
    expect(raised.previous(Entity.none, name)).toBe(null);
});

it("runs as usual without the option, and with input that only looks like it", async () => {
    await using world = createWorld();
    const echoing = System.create({}, (_context, input: { readonly changes: boolean }) => input.changes);
    expect(await world.run(echoing, { changes: true })).toBe(true);
    expect(await world.run(raise)).toBe(undefined);
});

it("gives the rows spawnTables spawns and the entities despawnWhere despawns as a run's changes", async () => {
    await using world = createWorld();
    await world.run(enter, { who: "cy" });
    copied.tables = (await world.run(readNamed)).archetypes;
    // The tables copy names alone.
    expect(describe(await world.run(copy, { changes: true }))).toEqual([{ from: null, to: ["runChanges/name"], replaced: [], values: [[null, null, "cy"]] }]);
    expect(describe(await world.run(clear, { changes: true }))).toEqual([
        { from: ["runChanges/name"], to: null, replaced: [], values: [[null, null, "cy"]] },
        { from: ["runChanges/name", "runChanges/score"], to: null, replaced: [], values: [[10, null, "cy"]] },
    ]);
});
