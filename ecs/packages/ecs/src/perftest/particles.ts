// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Schema } from "../interface/schema/schema.js";
import { System } from "../interface/system/system.js";
import { Vec3, type F32, type U32 } from "../interface/math/index.js";

// Mirrors adobe/data's ecs1/ecs2 perftests (packages/data/src/perftest): 1M particles split evenly across
// 4 archetypes by visible/enabled; move adds velocity to position for the visible and enabled quarter.

const vec3 = { type: "array", items: { type: "number", precision: 1 }, minItems: 3, maxItems: 3 } as const satisfies Schema;

const color = Symbol("perf/color");
const mass = Symbol("perf/mass");
export const position = Symbol("perf/position");
const velocity = Symbol("perf/velocity");
export const visible = Symbol("perf/visible");
export const enabled = Symbol("perf/enabled");
const position64 = Symbol("perf/position64");
const velocity64 = Symbol("perf/velocity64");
const mass64 = Symbol("perf/mass64");
const step = Symbol("perf/step");

declare module "@adobe/ecs" {
    export interface Components {
        [color]: { type: U32 };
        [mass]: { type: F32 };
        [position]: { type: Schema.Type<{ type: "array"; items: { type: "number"; precision: 1 }; minItems: 3; maxItems: 3 }> };
        [velocity]: { type: Schema.Type<{ type: "array"; items: { type: "number"; precision: 1 }; minItems: 3; maxItems: 3 }> };
        [visible]: { type: true };
        [enabled]: { type: true };
        [position64]: { type: [number, number, number] };
        [velocity64]: { type: [number, number, number] };
        [mass64]: { type: number };
    }
    export interface Resources {
        [step]: { type: number; default: 0.016 };
    }
}


/** Interleaved like ecs2's seedSingle: entity i goes to archetype i % 4. */
const archetypes = [
    [color, mass, position, velocity, visible, enabled] as const,
    [color, mass, position, velocity, visible] as const,
    [color, mass, position, velocity, enabled] as const,
    [color, mass, position, velocity] as const,
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
    components: { with: [velocity, position, visible, enabled] },
}, row => {
    const [px, py, pz] = row[position];
    const [vx, vy, vz] = row[velocity];
    row[position] = [px + vx, py + vy, pz + vz];
});

/**
 * Euler integration as the guide writes it, with no `kernel` flag: velocity scaled by each row's mass and the step, added
 * to position, through nested calls.
 */
export const integrate = System.create({
    components: { with: [velocity, position, mass, visible, enabled] },
}, (row, _context, input: { readonly delta: number }) => {
    row[position] = Vec3.add(row[position], Vec3.scale(row[velocity], row[mass] * input.delta));
});

/** `integrate` for the rows whose velocity changed since it last ran. */
export const integrateChanged = System.create({
    components: { with: [velocity, position, mass, visible, enabled], changed: [velocity] },
}, (row, { resources }) => {
    row[position] = Vec3.add(row[position], Vec3.scale(row[velocity], row[mass] * resources[step]));
});

/** Writes the velocity of a scattered half of the rows, by a hash of each entity: changes no branch predicts. */
export const nudgeHalf = System.create({
    kernel: true,
    components: { with: [velocity, visible, enabled] },
}, (row, _context, input: { readonly z: number }) => {
    const hashed = Math.imul(row.entity ^ (row.entity >>> 16), 0x45d9f3b);
    if (((hashed ^ (hashed >>> 16)) & 1) === 0) row[velocity] = [row[velocity][0], row[velocity][1], input.z];
});

/** Particles of f64 position, velocity and mass. */
export const spawn64 = System.create({}, ({ commands }, input: { readonly count: number }) => {
    for (let i = 0; i < input.count; i++) commands.spawn([position64, velocity64, mass64])({ [position64]: [i + 1, i + 1, i + 1], [velocity64]: [-i, -i, -i], [mass64]: 10 });
});

/** `integrate` over f64 components. */
export const integrate64 = System.create({
    components: { with: [velocity64, position64, mass64] },
}, (row, _context, input: { readonly delta: number }) => {
    const [px, py, pz] = row[position64];
    const [vx, vy, vz] = row[velocity64];
    const step = row[mass64] * input.delta;
    row[position64] = [px + vx * step, py + vy * step, pz + vz * step];
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
