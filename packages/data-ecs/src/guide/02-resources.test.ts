import { expect, it } from "vitest";
import { Observe, Resource } from "../index.js";
import { createWorld } from "../implementation/index.js";

// A resource is a key with a type and a schema; a world holds one value of it.
export const gravity = Symbol("gravity");

declare module "@adobe/data-ecs" {
    interface Resources {
        [gravity]: { type: number };
    }
}

// A resource always has a value, so its schema has a default.
Resource.register(gravity, { type: { type: "number", default: -9.8 } });

it("holds one value per world", async () => {
    // A world starts each resource at its default, or at the value given when it's created.
    await using earth = createWorld();
    await using moon = createWorld({ [gravity]: -1.6 });
    // Observe.toPromise reads an observer's current value.
    expect(await Observe.toPromise(earth.observe.resource(gravity))).toBe(-9.8);
    expect(await Observe.toPromise(moon.observe.resource(gravity))).toBe(-1.6);
});
