// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System, World } from "../index.js";

const handle = Symbol();
const size = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [handle]: { type: number };
        [size]: { type: number };
    }
}

/** What handles name outside the world, as GPU buffers and DOM nodes are. */
const open = new Set<number>();

const release = System.removed({ components: { with: [handle] } }, row => {
    open.delete(row[handle]);
});

const spawn = System.create(({ commands }) => {
    for (const id of [7, 8, 9]) {
        open.add(id);
        commands.spawn([handle, size])({ [handle]: id, [size]: 1 });
    }
});
const destroy = System.create({ components: { with: [handle] } }, (row, { commands }) => {
    if (row[handle] === 7) commands.despawn(row.entity);
    else if (row[handle] === 8) commands.remove(row.entity, handle);
});

const grow = System.create({ components: { with: [size] } }, row => {
    row[size] += 1;
});

const saved: string[] = [];
let written = "";

const save = System.changes({ watch: [handle, size] }, changes => {
    for (const group of changes.groups) {
        for (const entity of group.entities) saved.push(`${changes.previous(entity, handle)} → ${changes.next(entity, handle)}`);
    }
    written = changes.written.map(key => key === size ? "size" : "handle").join(", ");
});

const handles = System.create([release, save]);

export const main = async (): Promise<void> => {
    const world = World.create();
    world.add(handles);
    await world.run(spawn);
    console.log("changed:", saved.sort().join(", "));
    saved.length = 0;
    await world.run(destroy);
    console.log("changed:", saved.sort().join(", "));
    console.log("open", [...open]);
    await world.run(grow);
    console.log("written:", written);
    await world.dispose();
    console.log("open", [...open]);
};
