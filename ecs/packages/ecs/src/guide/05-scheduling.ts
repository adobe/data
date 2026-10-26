// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System, World } from "../index.js";

const health = Symbol();
const damage = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [health]: { type: number };
        [damage]: { type: number };
    }
}

const spawn = System.create(({ commands }) => { commands.spawn([health, damage])({ [health]: 10, [damage]: 4 }); });
const hit = System.create({ components: { with: [damage, health] } }, row => {
    row[health] -= row[damage];
});
const heal = System.create({ components: { with: [health] }, after: [hit] }, row => {
    row[health] = Math.min(row[health] * 2, 10);
});
const frame = System.create([heal, hit]);

const read = System.create({ observer: true, components: { with: [health] } }, row => {
    console.log("health", row[health]);
});

// Phases: systems that do nothing.
const update = System.create(() => {});
const render = System.create({ after: [update] }, () => {});
const poison = System.create({ components: { with: [health] }, during: [update] }, row => {
    row[health] -= 1;
});
const report = System.create({ components: { with: [health] }, during: [render] }, row => {
    console.log("health as it renders", row[health]);
});
const phased = System.create([report, poison, update, render]);

export const main = async (): Promise<void> => {
    await using world = World.create();
    await world.run(spawn);
    // hit, 10 - 4 = 6, then heal, min(12, 10).
    await world.run(frame);
    await world.run(read);
    // poison, then report.
    await world.run(phased);
};
