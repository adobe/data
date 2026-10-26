// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Rule, System, World } from "../index.js";

const mesh = Symbol();
const sprite = Symbol();
const hidden = Symbol();
const drawn = Symbol();
const layer = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [mesh]: { type: number };
        [sprite]: { type: number };
        [hidden]: { type: true };
        [drawn]: { type: true; derived: true };
        [layer]: { type: number; derived: true; default: 1 };
    }
}

Rule.create({ components: { with: [mesh], not: [hidden] }, derive: [drawn] });
Rule.create({ components: { with: [sprite], not: [hidden] }, derive: [drawn] });
Rule.create({ components: { with: [drawn] }, derive: [layer] });

const spawn = System.create(({ commands }) => {
    commands.spawn([mesh])({ [mesh]: 1 });
    commands.spawn([sprite])({ [sprite]: 2 });
    commands.spawn([mesh, hidden])({ [mesh]: 3 });
});
const hide = System.create({ components: { with: [sprite] } }, (row, { commands }) => {
    commands.add(row.entity, hidden);
});

const drawing: string[] = [];
const read = System.create({ observer: true, components: { with: [layer, drawn], optional: [mesh, sprite] } }, row => {
    drawing.push(`${row[mesh] === undefined ? `sprite ${row[sprite]}` : `mesh ${row[mesh]}`} on layer ${row[layer]}`);
});
/** Logs what's drawn, in order. */
const logDrawn = async (world: World): Promise<void> => {
    drawing.length = 0;
    await world.run(read);
    console.log("drawn:", drawing.sort().join(", "));
};

export const main = async (): Promise<void> => {
    await using world = World.create();
    await world.run(spawn);
    await logDrawn(world);
    await world.run(hide);
    await logDrawn(world);
};
