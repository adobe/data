import { expect, it } from "vitest";
import { Component, Finalizer, System, Vec3, World } from "../index.js";

const position = "guide/finalizers/position";
const handle = "guide/finalizers/handle";
const debris = "guide/finalizers/debris";

declare module "@adobe/data-ecs" {
    interface Components {
        [position]: { type: Vec3 };
        [handle]: { type: number };
        [debris]: { type: true };
    }
    interface Finalizers {
        "guide/finalizers/release": true;
    }
    interface Systems {
        "guide/finalizers/spawn": true;
        "guide/finalizers/destroy": true;
    }
}

Component.register(position, { type: Vec3.schema });
Component.register(handle, { type: { type: "number" } });
Component.register(debris, { type: { const: true } });

/** What handles name, outside the world, as GPU buffers and DOM nodes are. */
const open = new Set<number>();

// A finalizer runs inside the sync point for each entity that stops matching its query, whatever the cause, reading
// its values from before the sync point applies. Its commands apply at the next sync point.
Finalizer.create({ name: "guide/finalizers/release", components: { read: [position, handle] } }, (row, { commands }) => {
    open.delete(row[handle]);
    const [x, y, z] = row[position];
    commands.spawn({ [position]: [x, y, z], [debris]: true });
});

const spawn = System.create({ name: "guide/finalizers/spawn" }, ({ commands }) => {
    for (const id of [7, 8]) {
        open.add(id);
        commands.spawn({ [position]: [id, 0, 0], [handle]: id });
    }
});
const destroy = System.create({ name: "guide/finalizers/destroy", components: { read: [handle] } }, (row, { commands }) => {
    if (row[handle] === 7) commands.despawn(row.entity);
    else commands.remove(row.entity, handle);
});

it("releases what entities held when they stop matching", async () => {
    await using world = World.create();
    await world.run(spawn);
    await world.run(destroy);
    expect([...open]).toEqual([]);
    expect(world.query.count([debris])).toBe(0);
    await world.run(spawn);
    expect(world.query.count([debris])).toBe(2);
});

it("releases what every live entity holds when the world is disposed", async () => {
    const world = World.create();
    await world.run(spawn);
    expect(open.size).toBe(2);
    await world.dispose();
    expect(open.size).toBe(0);
});
