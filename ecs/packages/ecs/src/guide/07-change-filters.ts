// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System, World } from "../index.js";

const score = Symbol();
const shown = Symbol();
const boss = Symbol();
const level = Symbol();
const paused = Symbol();
const map = Symbol();
const steps = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [score]: { type: number };
        [shown]: { type: number };
        [boss]: { type: true };
    }
    interface Resources {
        [level]: { type: number; default: 1 };
        [paused]: { type: boolean };
        [map]: { type: { readonly width: number } | null };
        [steps]: { type: number };
    }
}

const load = System.create({ resources: { changed: [level] } }, ({ resources, commands }) => {
    commands.spawn([score, shown, boss])({ [score]: 0, [shown]: -1 });
    for (let i = 0; i < resources[level]; i++) commands.spawn([score, shown])({ [score]: 0, [shown]: -1 });
});
const show = System.create({ components: { with: [score, shown], changed: [score] } }, row => {
    row[shown] = row[score];
    console.log("showing", row[score]);
});
const bump = System.create({ components: { with: [score, boss] } }, row => {
    row[score] += 10;
});

let loaded = 0;
const countLoaded = System.create({ readonly: true, components: { with: [shown] } }, () => {
    loaded += 1;
});

const step = System.create({ resources: { is: [map], not: [paused] } }, ({ resources }) => {
    resources[steps] += resources[map].width;
});
const pause = System.create({}, ({ resources }) => { resources[paused] = true; });
const open = System.create({}, ({ resources }) => { resources[map] = { width: 4 }; });
const readSteps = System.create({ readonly: true }, ({ resources }) => resources[steps]);

export const main = async (): Promise<void> => {
    await using world = World.create();
    // Loads once: level hasn't changed since.
    await world.run(load);
    await world.run(load);
    await world.run(countLoaded);
    console.log("loaded", loaded);
    // Shows every score, then only the boss's.
    await world.run(show);
    await world.run(bump);
    await world.run(show);

    // Without a map, step doesn't run; with one it does, until paused.
    await world.run(step);
    console.log("steps", await world.run(readSteps));
    await world.run(open);
    await world.run(step);
    await world.run(pause);
    await world.run(step);
    console.log("steps", await world.run(readSteps));
};
