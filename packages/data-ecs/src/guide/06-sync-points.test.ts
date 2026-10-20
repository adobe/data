import { expect, it } from "vitest";
import { Component, Observe, Resource, System } from "../index.js";
import { createWorld } from "../implementation/index.js";

const health = Symbol("health");
const seen = Symbol("seen");

declare module "@adobe/data-ecs" {
    interface Components {
        [health]: { type: number };
    }
    interface Resources {
        [seen]: { type: number };
    }
}

Component.register(health, { type: { type: "number" } });
Resource.register(seen, { type: { type: "number", default: 0 } });

// Value writes apply at once; commands wait for the sync point that ends each run, then apply in the order issued.
const spawn = System.create(({ commands }) => {
    // spawn gives the entity at once, so later commands can name it.
    const hero = commands.spawn([health])({ [health]: 3 });
    commands.add(hero, health, 5);
    // Spawned and despawned before the sync point, it never exists.
    commands.despawn(commands.spawn([health])({ [health]: 1 }));
});
// A composite is one run with one sync point: count runs after spawn, before its entities exist.
const count = System.create({ components: { has: [health] }, resources: { write: [seen] }, after: [spawn] }, (row, { resources }) => {
    resources[seen] += 1;
});
const frame = System.create([spawn, count]);

const healths: number[] = [];
// A synced system runs after the sync point of every run and tick it's added to, reading what it left; it writes nothing.
const watch = System.create({ synced: true, components: { read: [health] } }, row => {
    healths.push(row[health]);
});

it("applies commands at the sync point that ends each run", async () => {
    await using world = createWorld();
    await world.run(frame);
    expect(await Observe.toPromise(world.observe.resource(seen))).toBe(0);
    const [hero] = await Observe.toPromise(world.observe.select({ required: [health] }));
    expect((await Observe.toPromise(world.observe.entity(hero, { required: [health] })))?.[health]).toBe(5);
    await world.run(count);
    expect(await Observe.toPromise(world.observe.resource(seen))).toBe(1);
});

it("runs synced systems after each sync point", async () => {
    await using world = createWorld();
    world.add(watch);
    await world.run(spawn);
    expect(healths).toEqual([5]);
});
