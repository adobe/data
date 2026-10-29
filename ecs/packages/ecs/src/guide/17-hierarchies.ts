// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity, System, World } from "../index.js";

const parent = Symbol();
const offset = Symbol();
const placed = Symbol();
const label = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        // Despawned with its parent.
        [parent]: { type: Entity; reference: "owner" };
        [offset]: { type: number };
        [placed]: { type: number };
        [label]: { type: string };
    }
}

const place = System.create({ components: { with: [offset, placed] }, up: { through: parent } }, (row, { up }) => {
    row[placed] = (up === null ? 0 : up[placed]) + row[offset];
});

const where: string[] = [];
const read = System.create({ readonly: true, components: { with: [label, placed] } }, row => {
    where.push(`${row[label]} at ${row[placed]}`);
});

const spawn = System.create(({ commands }) => {
    const table = commands.spawn([label, offset, placed])({ [label]: "table", [offset]: 10, [placed]: 0 });
    const tray = commands.spawn([label, offset, placed, parent])({ [label]: "tray", [offset]: 2, [placed]: 0, [parent]: table });
    commands.spawn([label, offset, placed, parent])({ [label]: "cup", [offset]: 1, [placed]: 0, [parent]: tray });
});

export const main = async (): Promise<void> => {
    await using world = World.create();
    await world.run(spawn);
    await world.run(place);
    await world.run(read);
    console.log(where.sort().join(", "));
};
