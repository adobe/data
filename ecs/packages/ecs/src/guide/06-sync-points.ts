// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System, World } from "../index.js";

const health = Symbol();
const seen = Symbol();
const seenEarly = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [health]: { type: number };
    }
    interface Resources {
        [seen]: { type: number };
        [seenEarly]: { type: number };
    }
}

const spawn = System.create(({ commands }) => {
    const hero = commands.spawn([health])({ [health]: 3 });
    commands.add(hero, health, 5);
    // Never exists.
    commands.despawn(commands.spawn([health])({ [health]: 1 }));
});
const count = System.create({ components: { with: [health] }, after: [spawn] }, (row, { resources }) => {
    resources[seen] += 1;
});
const early = System.create({ components: { with: [health] } }, (row, { resources }) => {
    resources[seenEarly] += 1;
});
const frame = System.create([spawn, count, early]);

const watch = System.create({ readonly: true, components: { with: [health] } }, row => {
    console.log("health", row[health]);
});
const readSeen = System.create({ readonly: true }, ({ resources }) => [resources[seen], resources[seenEarly]]);

export const main = async (): Promise<void> => {
    await using world = World.create();
    await world.run(frame);
    const [counted, countedEarly] = await world.run(readSeen);
    console.log("counted", counted, "early", countedEarly);

    await using watched = World.create();
    watched.add(watch);
    await watched.run(spawn);
};
