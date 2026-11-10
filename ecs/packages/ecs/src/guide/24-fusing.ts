// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type I32, System, World } from "../index.js";

const health = Symbol();
const armor = Symbol();
const shown = Symbol();
const score = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [health]: { type: I32 };
        [armor]: { type: I32 };
        [shown]: { type: I32 };
        [score]: { type: number };
    }
}

const regenerate = System.create({ kernel: true, components: { with: [health] } }, row => {
    row[health] = row[health] < 10 ? row[health] + 2 : row[health] - 1;
});

const hurt = System.create({ kernel: true, components: { with: [health, armor] }, after: [regenerate] }, row => {
    if (row[health] > row[armor]) row[health] = row[health] - row[armor];
});

const show = System.create({ kernel: true, components: { with: [health, shown] }, after: [hurt] }, row => {
    row[shown] = row[health] * 10;
});

// Shares nothing with the others, so runs on its own.
const tally = System.create({ kernel: true, components: { with: [score] } }, row => {
    row[score] += 1;
});

const frame = System.create([regenerate, hurt, show, tally]);

const spawn = System.create(({ commands }) => {
    for (let i = 0; i < 3; i++) commands.spawn([health, armor, shown])({ [health]: 4 * i, [armor]: 3, [shown]: 0 });
    commands.spawn([health])({ [health]: 7 });
    commands.spawn([score])({ [score]: 0 });
});

const rows: string[] = [];
const read = System.create({ readonly: true, components: { with: [health], optional: [shown] } }, row => {
    rows.push(`health ${row[health]}${row[shown] === undefined ? "" : `, shown ${row[shown]}`}`);
});
const total = System.create({ readonly: true, components: { with: [score] } }, row => row[score]);

export const main = async (): Promise<void> => {
    await using world = World.create();
    await world.run(spawn);
    for (let i = 0; i < 3; i++) await world.run(frame);
    await world.run(read);
    console.log(rows.sort().join("; "));
    console.log("score", await world.run(total));
};
