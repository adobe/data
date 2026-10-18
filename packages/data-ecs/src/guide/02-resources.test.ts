import { expect, it } from "vitest";
import { Observe, Resource } from "../index.js";
import { createWorld } from "../implementation/index.js";

// A resource is a key with a type and a schema; a world holds one value of it.
export const gravity = Symbol("gravity");
export const names = Symbol("names");

// Registration returns the key's traits, its type the one its schema describes. A resource always has a value, so
// its schema has a default.
const gravityTraits = Resource.register(gravity, { type: { type: "number", default: -9.8 } });
// A value that isn't data, such as a Map or a DOM node, states its type, and a resource's default is beside it.
const namesTraits = Resource.register(names, { type: Resource.object<Map<string, number>>(), default: new Map() });

// The types come from those traits.
declare module "@adobe/data-ecs" {
    interface Resources {
        [gravity]: typeof gravityTraits;
        [names]: typeof namesTraits;
    }
}

it("holds one value per world", async () => {
    // A world starts each resource at its default, or at the value given when it's created.
    await using earth = createWorld();
    await using moon = createWorld({ [gravity]: -1.6 });
    // Observe.toPromise reads an observer's current value.
    expect(await Observe.toPromise(earth.observe.resource(gravity))).toBe(-9.8);
    expect(await Observe.toPromise(moon.observe.resource(gravity))).toBe(-1.6);
    expect(await Observe.toPromise(earth.observe.resource(names))).toBeInstanceOf(Map);
});
