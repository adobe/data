import { Archetype } from "../interface/archetype/archetype.js";
import { Component } from "../interface/component/component.js";
import { System } from "../interface/system/system.js";

// A hundred archetypes, each grown at once: what a sync point costs where every archetype it touches grows.

const value = Symbol("growth/value");
const g0 = Symbol("growth/g0");
const g1 = Symbol("growth/g1");
const g2 = Symbol("growth/g2");
const g3 = Symbol("growth/g3");
const g4 = Symbol("growth/g4");
const g5 = Symbol("growth/g5");
const g6 = Symbol("growth/g6");

declare module "@adobe/data-ecs" {
    export interface Components {
        [value]: typeof valueTraits;
        [g0]: typeof g0Traits;
        [g1]: typeof g1Traits;
        [g2]: typeof g2Traits;
        [g3]: typeof g3Traits;
        [g4]: typeof g4Traits;
        [g5]: typeof g5Traits;
        [g6]: typeof g6Traits;
    }
}

const valueTraits = Component.register(value, { type: { type: "number", precision: 1 } });
const g0Traits = Component.register(g0, { type: { const: true } });
const g1Traits = Component.register(g1, { type: { const: true } });
const g2Traits = Component.register(g2, { type: { const: true } });
const g3Traits = Component.register(g3, { type: { const: true } });
const g4Traits = Component.register(g4, { type: { const: true } });
const g5Traits = Component.register(g5, { type: { const: true } });
const g6Traits = Component.register(g6, { type: { const: true } });

const tags = [g0, g1, g2, g3, g4, g5, g6] as const;
/** `value` with each of the first 100 sets of the seven tags, by their bits. */
const hundred = Array.from({ length: 100 }, (_, bits) => Archetype.create([value, ...tags.filter((_, bit) => (bits & (1 << bit)) !== 0)]));

/** Spawns `count` entities into each of the hundred archetypes. */
export const fillEach = System.create({ name: "growth/fillEach", input: { type: "object", properties: { count: { type: "integer" } } } }, ({ input, commands }) => {
    for (const archetype of hundred) for (let i = 0; i < input.count; i++) commands.spawn(archetype)({ [value]: i });
});

/** One spawn into each of the hundred archetypes. */
export const spawnEach = System.create({ name: "growth/spawnEach" }, ({ commands }) => {
    for (const archetype of hundred) commands.spawn(archetype)({ [value]: 0 });
});

/** A kernel over every row of the hundred archetypes. */
export const bumpEach = System.create({ name: "growth/bumpEach", kernel: "cpu", components: { write: [value] } }, row => {
    row[value] = row[value] + 1;
});
