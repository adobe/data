import { describe, expect, it } from "vitest";
import { Component, System, World, workers } from "./index.js";

const count = Symbol("worldTest/count");
declare module "@adobe/ecs" {
    export interface Components {
        [count]: { type: number };
    }
}
Component.register(count, { type: { type: "number" } });

const spawn = System.create({ name: "worldTest/spawn" }, ({ commands }) => { commands.spawn([count])({ [count]: 1 }); });
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
