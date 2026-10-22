// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Component, Resource, System, World, workers } from "./index.js";

const count = Symbol("worldTest/count");
const total = Symbol("worldTest/total");
declare module "@adobe/ecs" {
    export interface Components {
        [count]: { type: number };
    }
    export interface Resources {
        [total]: { type: number };
    }
}
Component.register(count, { type: { type: "number" } });
Resource.register(total, { type: { type: "number", default: 0 } });

const spawn = System.create({ name: "worldTest/spawn" }, ({ commands }) => { commands.spawn([count])({ [count]: 1 }); });
const raise = System.create({ name: "worldTest/raise", resources: { write: [total] } }, ({ resources }) => { resources[total] = 7; });
const add = System.create({ name: "worldTest/add", components: { write: [count] } }, row => { row[count] += 1; });

describe("World.create", () => {
    it("creates a world from the package root, the one import that names everything else", async () => {
        await using world = World.create({ [workers]: 0 });
        await world.run(spawn);
        await world.run(add);
        let seen = 0;
        await world.run(System.create({ observer: true, components: { read: [count] } }, row => { seen = row[count]; }));
        expect(seen).toBe(2);
    });
    it("rejects a key that isn't a resource, as worlds the implementation creates do", () => {
        expect(() => Reflect.apply(World.create, undefined, [{ [count]: 1 }])).toThrow("isn't a registered resource");
    });
});

describe("World.join", () => {
    it("joins a world another thread shared, from the package root, and runs there", async () => {
        await using world = World.create({ [workers]: 0 });
        const channel = new MessageChannel();
        world.share(channel.port1);
        await using joined = World.join(channel.port2);
        await joined.run(raise);
        let seen = 0;
        await world.run(System.create({ observer: true, resources: { read: [total] } }, ({ resources }) => { seen = resources[total]; }));
        expect(seen).toBe(7);
    });
});
