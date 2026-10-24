// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect, it } from "vitest";
import { type F32, System, World } from "../index.js";

const mass = Symbol();
const total = Symbol();
const heaviest = Symbol();
const count = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [mass]: { type: F32 };
    }
    // A reduced resource names how contributions combine: "+", "*", "min", "max", or bitwise "&", "|", "^".
    interface Resources {
        [total]: { type: number; reduce: "+" };
        [heaviest]: { type: F32; reduce: "max" };
        [count]: { type: number; reduce: "+" };
    }
}

// Each row contributes; every run starts each resource it reduces at its operator's identity and leaves it holding the
// fold of what every row gave, however the rows were split across workers.
const weigh = System.create({ components: { with: [mass] } }, (row, { reduce }) => {
    reduce[total](row[mass]);
    reduce[heaviest](row[mass]);
    reduce[count](1);
});

// Read the result after the run, as any resource.
let summary = "";
const report = System.create({ observer: true }, ({ resources }) => {
    summary = `${resources[count]} weigh ${resources[total]}, at most ${resources[heaviest]}`;
});

const spawn = System.create(({ commands }) => {
    for (const value of [2, 5, 3]) commands.spawn([mass])({ [mass]: value });
});

it("folds rows into a resource", async () => {
    await using world = World.create();
    await world.run(spawn);
    await world.run(weigh);
    await world.run(report);
    expect(summary).toBe("3 weigh 10, at most 5");
});
