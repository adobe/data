// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity, System, World } from "../index.js";

const health = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [health]: { type: number };
    }
}

// Spawns two, and returns the first.
const spawn = System.create(({ commands }) => {
    const player = commands.spawn([health])({ [health]: 10 });
    commands.spawn([health])({ [health]: 10 });
    return player;
});

const hit = System.create({
    components: { with: [health] },
}, (row, _context, input: { readonly amount: number }) => {
    row[health] -= input.amount;
});

const heal = System.create({
    components: { with: [health] },
    target: "entity",
}, (row, _context, input: { readonly entity: Entity; readonly amount: number }) => {
    row[health] += input.amount;
});

const healths: number[] = [];
const read = System.create({ readonly: true, components: { with: [health] } }, row => {
    healths.push(row[health]);
});

export const main = async (): Promise<void> => {
    await using world = World.create();
    const player = await world.run(spawn);
    await world.run(hit, { amount: 3 });
    // Only the player heals.
    await world.run(heal, { entity: player, amount: 1 });
    await world.run(read);
    console.log("healths", healths.sort((a, b) => a - b));
};
