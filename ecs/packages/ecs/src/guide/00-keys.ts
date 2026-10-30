// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System, World } from "../index.js";

// Each key a Symbol() bound at the module's top level.
export const score = Symbol();
export const bonus = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [score]: { type: number };
    }
    interface Resources {
        [bonus]: { type: number; default: 5 };
    }
}

const spawn = System.create(({ commands }) => {
    commands.spawn([score])({ [score]: 10 });
});

// No generics: the declarations type row[score] and resources[bonus] as numbers.
const award = System.create({ components: { with: [score] } }, (row, { resources }) => {
    row[score] += resources[bonus];
});

const read = System.create({ readonly: true, components: { with: [score] } }, row => {
    console.log("score", row[score]);
});

export const main = async (): Promise<void> => {
    await using world = World.create();
    await world.run(spawn);
    await world.run(award);
    await world.run(read);
};
