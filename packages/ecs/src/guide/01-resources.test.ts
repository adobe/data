import { expect, it } from "vitest";
import { Entity, Resource, System, World } from "../index.js";

// A resource is a key whose value a world holds once.
export const gravity = Symbol("gravity");
export const names = Symbol("names");
export const audio = Symbol("audio");
export const focused = Symbol("focused");

// Its traits are declared; `type` is the value's type.
declare module "@adobe/ecs" {
    interface Resources {
        [gravity]: { type: number };
        [names]: { type: ReadonlyMap<string, number> };
        [audio]: { type: AudioContext | null };
        [focused]: { type: Entity };
    }
}

// Registration gives the same traits, with a schema that describes exactly the declared type. A resource always has a
// value: its schema's default, or one beside it.
Resource.register(gravity, { type: { type: "number", default: -9.8 } });
Resource.register(names, { type: { type: "map", keys: { type: "string" }, values: { type: "number" } }, default: new Map() });
// A value that isn't data has no schema and is stored as it is. A type that allows null starts there.
Resource.register(audio, {});
// No entity is Entity.none rather than null, so an entity stays data every thread reads.
Resource.register(focused, { type: { ...Entity.schema, default: Entity.none } });

// Systems read a world: an observer only reads, after the world's changes apply.
let values: readonly unknown[] = [];
const read = System.create({ observer: true, resources: { read: [gravity, names, audio, focused] } }, ({ resources }) => {
    values = [resources[gravity], resources[names], resources[audio], resources[focused]];
});

it("holds one value per world", async () => {
    // A world starts each resource at its default, or at the value given when it's created.
    await using earth = World.create();
    await using moon = World.create({ [gravity]: -1.6 });
    // run: runs a system once.
    await earth.run(read);
    expect(values).toEqual([-9.8, new Map(), null, Entity.none]);
    await moon.run(read);
    expect(values[0]).toBe(-1.6);
});
