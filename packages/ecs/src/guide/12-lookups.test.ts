// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect, it } from "vitest";
import { Entity, System, World } from "../index.js";

const health = Symbol();
const target = Symbol();
const frozen = Symbol();
const aim = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [health]: { type: number };
        [target]: { type: Entity; reference: "weak" };
        [frozen]: { type: true };
        [aim]: { type: number };
    }
}

// The entity's row, or null when it doesn't have every component in with, or has one in not. The row holds only what
// with lists.
const track = System.create({
    components: { with: [target, aim] },
    lookup: { enemy: { with: [health], not: [frozen] } },
}, (row, { lookup }) => {
    const enemy = lookup.enemy(row[target]);
    row[aim] = enemy === null ? 0 : enemy[health];
});

// With changed, its row says whether those components may have changed since the system last ran.
const refreshed: boolean[] = [];
const watch = System.create({
    observer: true,
    components: { with: [target] },
    lookup: { enemy: { with: [health], changed: [health] } },
}, (row, { lookup }) => {
    const enemy = lookup.enemy(row[target]);
    if (enemy !== null) refreshed.push(enemy.changed);
});

const aims: number[] = [];
const readAims = System.create({ observer: true, components: { with: [aim] } }, row => {
    aims.push(row[aim]);
});

const spawn = System.create(({ commands }) => {
    const ogre = commands.spawn([health])({ [health]: 40 });
    const statue = commands.spawn([health, frozen])({ [health]: 90 });
    commands.spawn([target, aim])({ [target]: ogre, [aim]: -1 });
    commands.spawn([target, aim])({ [target]: statue, [aim]: -1 });
});

it("reads other entities by id", async () => {
    await using world = World.create();
    await world.run(spawn);
    await world.run(track);
    await world.run(readAims);
    // The frozen statue doesn't match, so its tracker reads null.
    expect(aims.sort()).toEqual([0, 40]);
    await world.run(watch);
    await world.run(watch);
    expect(refreshed).toEqual([true, true, false, false]);
});
