// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Entity } from "../../interface/entity/entity.js";
import { Index } from "../../interface/indexes/index-type.js";
import { System } from "../../interface/system/system.js";
import { workers } from "../../interface/resources/workers.js";
import { createWorld } from "./create.js";
import { count as countOf, readEach, select } from "./reads.test-helper.js";

const position = Symbol("syncPointsTest/position");
const cell = Symbol("syncPointsTest/cell");
const found = Symbol("syncPointsTest/found");
const team = Symbol("syncPointsTest/team");
const member = Symbol("syncPointsTest/member");
const local = Symbol("syncPointsTest/local");
const total = Symbol("syncPointsTest/total");
const parent = Symbol("syncPointsTest/parent");
const seed = Symbol("syncPointsTest/seed");
const grown = Symbol("syncPointsTest/grown");
const children = Symbol("syncPointsTest/children");

declare module "@adobe/ecs" {
    export interface Components {
        [position]: { type: number };
        [cell]: { type: number };
        [team]: { type: true };
        [member]: { type: Entity; reference: "owner" };
        [local]: { type: number };
        [total]: { type: number };
        [parent]: { type: Entity; reference: "weak" };
        [seed]: { type: number };
        [grown]: { type: number };
    }
    export interface Resources {
        [found]: { type: number };
        [children]: { type: number; default: 0 };
    }
}

const byCell = Index.create({ key: [cell] });

const spawn = System.create(({ commands }) => { for (let k = 0; k < 3; k++) commands.spawn([position])({ [position]: k }); });
const counted: number[] = [];
const count = System.create({ components: { with: [position] }, after: [spawn] }, row => { counted.push(row[position]); });
const changes: number[] = [];
const watchChanges = System.create({ components: { with: [position], changed: [position] }, after: [count] }, row => { changes.push(row[position]); });
const deriveCells = System.create({ components: { with: [position], not: [cell] }, after: [watchChanges] }, (row, { commands }) => { commands.add(row.entity, cell, row[position] % 2); });
const pick = System.create({ lookup: { cells: { index: byCell } }, after: [deriveCells] }, ({ lookup, resources }) => { resources[found] = lookup.cells(0).length; });
const readFound = System.create({ readonly: true }, ({ resources }) => resources[found]);
const frame = System.create([spawn, count, watchChanges, deriveCells, pick]);

const spawnTeams = System.create(({ commands }) => {
    for (let k = 0; k < 3; k++) {
        const owner = commands.spawn([team])();
        for (let m = 0; m < 2; m++) commands.spawn([member])({ [member]: owner });
    }
});
const disband = System.create({ components: { with: [team] }, after: [spawnTeams] }, (row, { commands }) => { commands.despawn(row.entity); });
const round = System.create([spawnTeams, disband]);

/** Spawns a root, `count` children of it and a child of each. */
const spawnTree = System.create({}, ({ commands }, input: { readonly count: number }) => {
    const root = commands.spawn([local, total])({ [local]: 1, [total]: 0 });
    for (let k = 0; k < input.count; k++) {
        const child = commands.spawn([local, total, parent])({ [local]: 1, [total]: 0, [parent]: root });
        commands.spawn([local, total, parent])({ [local]: 1, [total]: 0, [parent]: child });
    }
});
const propagate = System.create({ components: { with: [local, total], changed: [local] }, up: { through: parent }, after: [spawnTree] }, (row, { up }) => {
    row[total] = (up === null ? 0 : up[total]) + row[local];
});
const grow = System.create([spawnTree, propagate]);

const plant = System.create(({ commands }) => { for (let k = 0; k < 64; k++) commands.spawn([seed])({ [seed]: k }); });
const sprout = System.create({ kernel: true, components: { with: [seed] }, after: [plant] }, (row, { commands }) => {
    commands.spawn([grown])({ [grown]: row[seed] * 2 });
});
const tally = System.create({ components: { with: [grown] }, after: [sprout] }, (row, { resources }) => { resources[children] += row[grown]; });
const garden = System.create([plant, sprout, tally]);
const readChildren = System.create({ readonly: true }, ({ resources }) => resources[children]);

describe("sync points within a run", () => {
    it("apply commands before a later system that depends on what they change, which then sees them in the same run", async () => {
        const world = createWorld({ [workers]: 0 });
        await world.run(frame);
        expect(counted).toEqual([0, 1, 2]);
        expect(await world.run(readFound)).toBe(2);
        await world.dispose();
    });
    it("keep each change seen once by change filters across runs", async () => {
        const world = createWorld({ [workers]: 0 });
        changes.length = 0;
        await world.run(frame);
        expect(changes).toEqual([0, 1, 2]);
        changes.length = 0;
        counted.length = 0;
        await world.run(frame);
        // The second run's spawns are new; the first run's three are seen again by count alone.
        expect([counted.length, changes]).toEqual([6, [0, 1, 2]]);
        expect(await world.run(readFound)).toBe(4);
        await world.dispose();
    });

    it("despawn what rows spawned at an earlier sync point of the run own, once a later tier despawns their owners", async () => {
        expect(System.describe(round).tiers.map(tier => tier.sync === null)).toEqual([false, true]);
        await using world = createWorld({ [workers]: 0 });
        await world.run(round);
        expect([await countOf(world, { required: [team] }), await countOf(world, { required: [member] })]).toEqual([0, 0]);
    });

    it("bring an `up` tree up to date at each, built again or patched, for a tier after it in the same run", async () => {
        expect(System.describe(grow).tiers.map(tier => tier.sync === null)).toEqual([false, true]);
        await using world = createWorld({ [workers]: 0 });
        let spawned = 0;
        // Past the journal's worth a tree patches, then within it.
        for (const count of [5_000, 3_000, 10]) {
            await world.run(grow, { count });
            spawned += count;
            const totals = await readEach(world, await select(world, { required: [total] }), total);
            const byDepth = [1, 2, 3].map(depth => totals.filter(value => value === depth).length);
            expect([byDepth, totals.length]).toEqual([[totals.length - 2 * spawned, spawned, spawned], totals.length]);
        }
    });

    it("commit a kernel's staged spawns at a sync point within the run, for a later tier", async () => {
        expect(System.describe(garden).tiers.map(tier => tier.sync === null)).toEqual([false, false, true]);
        await using world = createWorld({ [workers]: 0 });
        const sum = 63 * 64;
        await world.run(garden);
        expect(await world.run(readChildren)).toBe(sum);
        // The second run's seeds are both runs' plantings, and its tally reads the first run's grown rows too.
        await world.run(garden);
        expect(await world.run(readChildren)).toBe(sum + sum + 2 * sum);
    });
});
