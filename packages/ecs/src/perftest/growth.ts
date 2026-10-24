// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "../interface/system/system.js";
import type { F32 } from "../interface/math/index.js";

// A hundred archetypes, each grown at once: what a sync point costs where every archetype it touches grows.

const value = Symbol("growth/value");
const g0 = Symbol("growth/g0");
const g1 = Symbol("growth/g1");
const g2 = Symbol("growth/g2");
const g3 = Symbol("growth/g3");
const g4 = Symbol("growth/g4");
const g5 = Symbol("growth/g5");
const g6 = Symbol("growth/g6");

declare module "@adobe/ecs" {
    export interface Components {
        [value]: { type: F32 };
        [g0]: { type: true };
        [g1]: { type: true };
        [g2]: { type: true };
        [g3]: { type: true };
        [g4]: { type: true };
        [g5]: { type: true };
        [g6]: { type: true };
    }
}


const tags = [g0, g1, g2, g3, g4, g5, g6] as const;
/** `value` with each of the first 100 sets of the seven tags, by their bits. */
const hundred = Array.from({ length: 100 }, (_, bits) => [value, ...tags.filter((_, bit) => (bits & (1 << bit)) !== 0)] as const);

/** Spawns `count` entities into each of the hundred archetypes. */
export const fillEach = System.create({}, ({ commands }, input: { readonly count: number }) => {
    for (const archetype of hundred) for (let i = 0; i < input.count; i++) commands.spawn(archetype)({ [value]: i });
});

/** One spawn into each of the hundred archetypes. */
export const spawnEach = System.create({}, ({ commands }) => {
    for (const archetype of hundred) commands.spawn(archetype)({ [value]: 0 });
});

/** A kernel over every row of the hundred archetypes. */
export const bumpEach = System.create({ kernel: true, components: { with: [value] } }, row => {
    row[value] = row[value] + 1;
});
