import { expect, it } from "vitest";
import { Component, Finalizer, System } from "../index.js";
import { createWorld } from "../implementation/index.js";

const handle = Symbol("handle");

declare module "@adobe/ecs" {
    interface Components {
        [handle]: { type: number };
    }
}

Component.register(handle, { type: { type: "number" } });

/** What handles name outside the world, as GPU buffers and DOM nodes are. */
const open = new Set<number>();

// Runs for each entity that stops matching, whatever the cause, reading its values from before.
Finalizer.create({ components: { read: [handle] } }, row => {
    open.delete(row[handle]);
});

const spawn = System.create(({ commands }) => {
    for (const id of [7, 8]) {
        open.add(id);
        commands.spawn([handle])({ [handle]: id });
    }
});
const destroy = System.create({ components: { read: [handle] } }, (row, { commands }) => {
    if (row[handle] === 7) commands.despawn(row.entity);
    else commands.remove(row.entity, handle);
});

it("releases what entities held when they stop matching", async () => {
    await using world = createWorld();
    await world.run(spawn);
    await world.run(destroy);
    expect([...open]).toEqual([]);
});

it("releases what every entity holds when the world is disposed", async () => {
    const world = createWorld();
    await world.run(spawn);
    // dispose runs every finalizer for the entities it still matches.
    await world.dispose();
    expect(open.size).toBe(0);
});

const saved: string[] = [];

// Sees each sync point's structural changes to the components it watches, grouped by how entities changed, with
// values before and after: for saving and undo.
Finalizer.changes({ watch: [handle] }, changes => {
    for (const group of changes.groups) {
        for (const entity of group.entities) saved.push(`${changes.previous(entity, handle)} → ${changes.next(entity, handle)}`);
    }
});

it("records each sync point's structural changes", async () => {
    saved.length = 0;
    await using world = createWorld();
    await world.run(spawn);
    await world.run(destroy);
    expect(saved.sort()).toEqual(["7 → null", "8 → null", "null → 7", "null → 8"]);
});
