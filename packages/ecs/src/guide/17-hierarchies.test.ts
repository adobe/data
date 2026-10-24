// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect, it } from "vitest";
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

// up runs rows parent first, through a reference, so each row reads its parent's values from earlier in the same run:
// context.up holds what the body reads of the parent, or null for a row without one.
const place = System.create({ components: { with: [offset, placed] }, up: { through: parent } }, (row, { up }) => {
    row[placed] = (up === null ? 0 : up[placed]) + row[offset];
});

const where: string[] = [];
const read = System.create({ observer: true, components: { with: [label, placed] } }, row => {
    where.push(`${row[label]} at ${row[placed]}`);
});

const spawn = System.create(({ commands }) => {
    const table = commands.spawn([label, offset, placed])({ [label]: "table", [offset]: 10, [placed]: 0 });
    const tray = commands.spawn([label, offset, placed, parent])({ [label]: "tray", [offset]: 2, [placed]: 0, [parent]: table });
    commands.spawn([label, offset, placed, parent])({ [label]: "cup", [offset]: 1, [placed]: 0, [parent]: tray });
});

it("runs rows parent first", async () => {
    await using world = World.create();
    await world.run(spawn);
    await world.run(place);
    await world.run(read);
    expect(where.sort()).toEqual(["cup at 13", "table at 10", "tray at 12"]);
});
