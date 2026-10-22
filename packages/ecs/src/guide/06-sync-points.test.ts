// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect, it } from "vitest";
import { Component, Resource, System, World } from "../index.js";

const health = Symbol("health");
const seen = Symbol("seen");

declare module "@adobe/ecs" {
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
// An observer runs after the sync point of every run and tick it's added to, reading what it left; it writes nothing.
const watch = System.create({ observer: true, components: { read: [health] } }, row => {
    healths.push(row[health]);
});
let counted = 0;
const readSeen = System.create({ observer: true, resources: { read: [seen] } }, ({ resources }) => {
    counted = resources[seen];
});

it("applies commands at the sync point that ends each run", async () => {
    await using world = World.create();
    await world.run(frame);
    await world.run(readSeen);
    expect(counted).toBe(0);
    await world.run(count);
    await world.run(readSeen);
    expect(counted).toBe(1);
});

it("runs observer systems after each sync point", async () => {
    healths.length = 0;
    await using world = World.create();
    world.add(watch);
    await world.run(spawn);
    expect(healths).toEqual([5]);
});
