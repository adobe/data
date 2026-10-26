// © 2026 Adobe. MIT License. See /LICENSE for details.
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

const track = System.create({
    components: { with: [target, aim] },
    lookup: { enemy: { with: [health], not: [frozen] } },
}, (row, { lookup }) => {
    const enemy = lookup.enemy(row[target]);
    row[aim] = enemy === null ? 0 : enemy[health];
});

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

export const main = async (): Promise<void> => {
    await using world = World.create();
    await world.run(spawn);
    await world.run(track);
    await world.run(readAims);
    console.log("aims", aims.sort((a, b) => a - b));
    await world.run(watch);
    console.log("changed", refreshed);
    refreshed.length = 0;
    await world.run(watch);
    console.log("changed", refreshed);
};
