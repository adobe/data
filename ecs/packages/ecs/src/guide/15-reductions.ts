// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type F32, System, World } from "../index.js";

const mass = Symbol();
const total = Symbol();
const heaviest = Symbol();
const count = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [mass]: { type: F32 };
    }
    interface Resources {
        [total]: { type: number; reduce: "+" };
        [heaviest]: { type: F32; reduce: "max" };
        [count]: { type: number; reduce: "+" };
    }
}

const weigh = System.create({ components: { with: [mass] } }, (row, { reduce }) => {
    reduce[total](row[mass]);
    reduce[heaviest](row[mass]);
    reduce[count](1);
});

const report = System.create({ observer: true }, ({ resources }) =>
    `${resources[count]} weigh ${resources[total]}, at most ${resources[heaviest]}`);

const spawn = System.create(({ commands }) => {
    for (const value of [2, 5, 3]) commands.spawn([mass])({ [mass]: value });
});

export const main = async (): Promise<void> => {
    await using world = World.create();
    await world.run(spawn);
    await world.run(weigh);
    console.log(await world.run(report));
};
