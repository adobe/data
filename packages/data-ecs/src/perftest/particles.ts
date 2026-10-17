import { Component } from "../interface/component/component.js";
import type { Schema } from "../interface/schema/schema.js";
import { System } from "../interface/system/system.js";

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

declare module "@adobe/data-ecs" {
    export interface Components {
        [color]: { type: number };
        [mass]: { type: number };
        [position]: { type: Vec3 };
        [velocity]: { type: Vec3 };
        [visible]: { type: true };
        [enabled]: { type: true };
    }
}

Component.register(color, { type: { type: "integer", minimum: 0, maximum: 0xFFFFFFFF } });
Component.register(mass, { type: { type: "number", precision: 1 } });
Component.register(position, { type: vec3 });
Component.register(velocity, { type: vec3 });
Component.register(visible, { type: { const: true } });
Component.register(enabled, { type: { const: true } });

/** Interleaved like ecs2's seedSingle: entity i goes to archetype i % 4. */
export const spawn = System.create({ name: "perf/spawn", input: { type: "object", properties: { count: { type: "integer" } } } }, ({ input, commands }) => {
    for (let i = 0; i < input.count; i++) {
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
