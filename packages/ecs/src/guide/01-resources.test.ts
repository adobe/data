// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect, it } from "vitest";
import { Entity, System, World } from "../index.js";

// A resource is a key whose value a world holds once.
export const gravity = Symbol();
export const names = Symbol();
export const audio = Symbol();
export const focused = Symbol();
const noNames: ReadonlyMap<string, number> = new Map();

// It's declared once, with its traits: `type` is the value's type, and `default` the value a world starts it at, which
// a type allowing null may leave out. The build registers what's declared.
declare module "@adobe/ecs" {
    interface Resources {
        [gravity]: { type: number; default: -9.8 };
        // A default that isn't a literal names a value with typeof.
        [names]: { type: ReadonlyMap<string, number>; default: typeof noNames };
        // A value that isn't data, such as a class, is stored as it is.
        [audio]: { type: AudioContext | null };
        // No entity is Entity.none rather than null, so an entity stays data every thread reads.
        [focused]: { type: Entity; default: typeof Entity.none };
    }
}

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
