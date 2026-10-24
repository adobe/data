// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect, it } from "vitest";
import { Entity, F32, System, World } from "../index.js";
import { Resource } from "@adobe/ecs";

// A resource is a key whose value a world holds once.
export const gravity = Symbol();
export const floor = Symbol();
export const names = Symbol();
export const audio = Symbol();
export const focused = Symbol();

// A type's namespace may give the value it starts at, which every row and world starting from it shares, so readonly.
export type Height = F32;
export const Height = { default: -Infinity } as const;

// It's declared once, with its traits: `type` is the value's type, and `default` a literal it starts at. Without one,
// it starts at its type's namespace's default, a reduction's identity, null, its zero value (0, false, "", item by
// item), or an empty ReadonlyMap or ReadonlySet of each world's own. The build registers what's declared.
declare module "@adobe/ecs" {
    interface Resources {
        [gravity]: { type: number; default: -9.8 };
        [floor]: { type: Height };
        [names]: { type: ReadonlyMap<string, number> };
        // A value that isn't data, such as a class, is stored as it is; a change inside it is seen once it's written back.
        [audio]: { type: AudioContext | null };
        // Entity.none, 0, rather than null, so an entity stays data every thread reads.
        [focused]: { type: Entity };
    }
}

// Systems read a world: an observer only reads, after the world's changes apply.
let values: readonly [
    Resource.Value<typeof gravity>,
    Resource.Value<typeof floor>,
    Resource.Value<typeof names>,
    Resource.Value<typeof audio>,
    Resource.Value<typeof focused>
] | null = null;
const read = System.create({ observer: true }, ({ resources }) => {
    values = [resources[gravity], resources[floor], resources[names], resources[audio], resources[focused]];
});

it("holds one value per world", async () => {
    // A world starts each resource at its default, or at the value given when it's created.
    await using earth = World.create();
    await using moon = World.create({ [gravity]: -1.6 });
    // run: runs a system once.
    await earth.run(read);
    expect(values).toEqual([-9.8, -Infinity, new Map(), null, Entity.none]);
    await moon.run(read);
    expect(values?.[0]).toBe(-1.6);
});
