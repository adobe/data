// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Archetype } from "../interface/archetype/archetype.js";
import type { Schema } from "../interface/schema/schema.js";
import { System } from "../interface/system/system.js";
import type { F32, U32 } from "../interface/math/index.js";

// Mirrors adobe/data's ecs1/ecs2 perftests (packages/data/src/perftest): 1M particles split evenly across
// 4 archetypes by visible/enabled; move adds velocity to position for the visible and enabled quarter.

type Vec3 = readonly [number, number, number];
const vec3 = { type: "array", items: { type: "number", precision: 1 }, minItems: 3, maxItems: 3 } as const satisfies Schema;

const color = Symbol("perf/color");
const mass = Symbol("perf/mass");
export const position = Symbol("perf/position");
const velocity = Symbol("perf/velocity");
export const visible = Symbol("perf/visible");
export const enabled = Symbol("perf/enabled");

declare module "@adobe/ecs" {
    export interface Components {
        [color]: { type: U32 };
        [mass]: { type: F32 };
        [position]: { type: Schema.Type<{ type: "array"; items: { type: "number"; precision: 1 }; minItems: 3; maxItems: 3 }> };
        [velocity]: { type: Schema.Type<{ type: "array"; items: { type: "number"; precision: 1 }; minItems: 3; maxItems: 3 }> };
        [visible]: { type: true };
        [enabled]: { type: true };
    }
}


/** Interleaved like ecs2's seedSingle: entity i goes to archetype i % 4. */
const archetypes = [
    Archetype.create([color, mass, position, velocity, visible, enabled]),
    Archetype.create([color, mass, position, velocity, visible]),
    Archetype.create([color, mass, position, velocity, enabled]),
    Archetype.create([color, mass, position, velocity]),
] as const;

export const spawn = System.create({}, ({ commands }, input: { readonly count: number }) => {
    for (let i = 0; i < input.count; i++) {
        const p = [i + 1, i + 1, i + 1] as const;
        const v = [-i, -i, -i] as const;
        commands.spawn(archetypes[i % 4])({ [color]: 0xff00ff, [mass]: 10, [position]: p, [velocity]: v });
    }
});

export const move = System.create({
    kernel: true,
    components: { read: [velocity], write: [position], has: [visible, enabled] },
}, row => {
    const [px, py, pz] = row[position];
    const [vx, vy, vz] = row[velocity];
    row[position] = [px + vx, py + vy, pz + vz];
});

/** Fastest of repeated runs within a time budget, like the adobe/data harness. */
export const fastest = async (run: () => Promise<unknown>, budget = 1000): Promise<{ readonly minimum: number; readonly passes: number }> => {
    for (let warm = 0; warm < 20; warm++) await run();
    let minimum = Infinity;
    let passes = 0;
    const end = performance.now() + budget;
    while (performance.now() < end) {
        const start = performance.now();
        await run();
        minimum = Math.min(minimum, performance.now() - start);
        passes++;
    }
    return { minimum, passes };
};
