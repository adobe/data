import { expect, it } from "vitest";
import { Observe, Resource } from "../index.js";
import { createWorld } from "../implementation/index.js";

// A resource is a key whose value a world holds once.
export const gravity = Symbol("gravity");
export const names = Symbol("names");
export const audio = Symbol("audio");

// Its traits are declared; `type` is the value's type.
declare module "@adobe/data-ecs" {
    interface Resources {
        [gravity]: { type: number };
        [names]: { type: ReadonlyMap<string, number> };
        [audio]: { type: AudioContext | null };
    }
}

// Registration gives the same traits, with a schema that describes exactly the declared type. A resource always has a
// value: its schema's default, or one beside it.
Resource.register(gravity, { type: { type: "number", default: -9.8 } });
Resource.register(names, { type: { type: "map", keys: { type: "string" }, values: { type: "number" } }, default: new Map() });
// A value that isn't data has no schema and is stored as it is. A type that allows null starts there.
Resource.register(audio, {});

it("holds one value per world", async () => {
    // A world starts each resource at its default, or at the value given when it's created.
    await using earth = createWorld();
    await using moon = createWorld({ [gravity]: -1.6 });
    // Observe.toPromise reads an observer's current value.
    expect(await Observe.toPromise(earth.observe.resource(gravity))).toBe(-9.8);
    expect(await Observe.toPromise(moon.observe.resource(gravity))).toBe(-1.6);
    expect(await Observe.toPromise(earth.observe.resource(names))).toEqual(new Map());
    expect(await Observe.toPromise(earth.observe.resource(audio))).toBe(null);
});
