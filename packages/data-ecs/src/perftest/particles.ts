import { Component } from "../component/component.js";
import type { Schema } from "../schema/schema.js";
import { System } from "../system/system.js";

// Mirrors adobe/data's ecs1/ecs2 perftests (packages/data/src/perftest): 1M particles split evenly across
// 4 archetypes by visible/enabled; move adds velocity to position for the visible and enabled quarter.

type Vec3 = readonly [number, number, number];
const vec3: Schema.ForType<Vec3> = { type: "array", items: { type: "number", precision: 1 }, minItems: 3, maxItems: 3 };

const color = "perf/color";
const mass = "perf/mass";
export const position = "perf/position";
const velocity = "perf/velocity";
export const visible = "perf/visible";
export const enabled = "perf/enabled";

declare module "../component/types.js" {
    export interface Types {
        [color]: number;
        [mass]: number;
        [position]: Vec3;
        [velocity]: Vec3;
        [visible]: true;
        [enabled]: true;
    }
}
declare module "../system/types.js" {
    export interface Types {
        "perf/spawn": true;
        "perf/move": true;
    }
}

Component.register(color, { type: "integer", minimum: 0, maximum: 0xFFFFFFFF });
Component.register(mass, { type: "number", precision: 1 });
Component.register(position, vec3);
Component.register(velocity, vec3);
Component.register(visible, { const: true });
Component.register(enabled, { const: true });

/** Interleaved like ecs2's seedSingle: entity i goes to archetype i % 4. */
export const spawn = System.create({ name: "perf/spawn", args: { type: "integer" } }, (_, { args }, commands) => {
    for (let i = 0; i < args; i++) {
        const p = [i + 1, i + 1, i + 1] as const;
        const v = [-i, -i, -i] as const;
        switch (i % 4) {
            case 0: commands.spawn({ [color]: 0xff00ff, [mass]: 10, [position]: p, [velocity]: v, [visible]: true, [enabled]: true }); break;
            case 1: commands.spawn({ [color]: 0xff00ff, [mass]: 10, [position]: p, [velocity]: v, [visible]: true }); break;
            case 2: commands.spawn({ [color]: 0xff00ff, [mass]: 10, [position]: p, [velocity]: v, [enabled]: true }); break;
            default: commands.spawn({ [color]: 0xff00ff, [mass]: 10, [position]: p, [velocity]: v });
        }
    }
});

export const move = System.create({
    name: "perf/move",
    kernel: "cpu",
    query: { read: [position, velocity], write: [position], has: [visible, enabled] },
}, row => {
    const [px, py, pz] = row[position];
    const [vx, vy, vz] = row[velocity];
    row[position] = [px + vx, py + vy, pz + vz];
});

/** Fastest of repeated runs within a time budget, like the adobe/data harness. */
export const fastest = async (run: () => Promise<void>, budget = 1000): Promise<{ readonly minimum: number; readonly passes: number }> => {
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
