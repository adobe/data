import { Component } from "../interface/component/component.js";
import { System } from "../interface/system/system.js";
import type { Values } from '../interface/component/values.js';

// Mirrors adobe/data's ecs2 `create` perftest (packages/data/src/perftest/ecs2-perf.ts): 1M particles of eight scalar
// components, interleaved over four archetypes by visible/enabled, each with its own values.

const color = Symbol("flat/color");
const mass = Symbol("flat/mass");
const positionX = Symbol("flat/positionX");
const positionY = Symbol("flat/positionY");
const positionZ = Symbol("flat/positionZ");
const velocityX = Symbol("flat/velocityX");
const velocityY = Symbol("flat/velocityY");
const velocityZ = Symbol("flat/velocityZ");
export const visible = Symbol("flat/visible");
export const enabled = Symbol("flat/enabled");

declare module "@adobe/data-ecs" {
    export interface Components {
        [color]: { type: number };
        [mass]: { type: number };
        [positionX]: { type: number };
        [positionY]: { type: number };
        [positionZ]: { type: number };
        [velocityX]: { type: number };
        [velocityY]: { type: number };
        [velocityZ]: { type: number };
        [visible]: { type: true };
        [enabled]: { type: true };
    }
}

Component.register(color, { type: { type: "integer", minimum: 0, maximum: 0xFFFFFFFF } });
for (const key of [mass, positionX, positionY, positionZ, velocityX, velocityY, velocityZ] as const) Component.register(key, { type: { type: "number", precision: 1 } });
Component.register(visible, { type: { const: true } });
Component.register(enabled, { type: { const: true } });

/** Entity i goes to archetype i % 4, like ecs2's seedSingle. */
export const spawnFlat = System.create({ name: "flat/spawn", input: { type: "object", properties: { count: { type: "integer" } } } }, ({ input, commands }) => {
    for (let i = 0; i < input.count; i++) {
        switch (i % 4) {
            case 0: commands.spawn({ [color]: 0xff00ff, [mass]: 10, [positionX]: i + 1, [positionY]: i + 1, [positionZ]: i + 1, [velocityX]: -i, [velocityY]: -i, [velocityZ]: -i, [visible]: true, [enabled]: true }); break;
            case 1: commands.spawn({ [color]: 0xff00ff, [mass]: 10, [positionX]: i + 1, [positionY]: i + 1, [positionZ]: i + 1, [velocityX]: -i, [velocityY]: -i, [velocityZ]: -i, [visible]: true }); break;
            case 2: commands.spawn({ [color]: 0xff00ff, [mass]: 10, [positionX]: i + 1, [positionY]: i + 1, [positionZ]: i + 1, [velocityX]: -i, [velocityY]: -i, [velocityZ]: -i, [enabled]: true }); break;
            default: commands.spawn({ [color]: 0xff00ff, [mass]: 10, [positionX]: i + 1, [positionY]: i + 1, [positionZ]: i + 1, [velocityX]: -i, [velocityY]: -i, [velocityZ]: -i });
        }
    }
});

/** The same spawns with each value object built first, so the compiler can't pass values positionally. */
export const spawnFlatDynamic = System.create({ name: "flat/dynamic", input: { type: "object", properties: { count: { type: "integer" } } } }, ({ input, commands }) => {
    for (let i = 0; i < input.count; i++) {
        const values: Values = { [color]: 0xff00ff, [mass]: 10, [positionX]: i + 1, [positionY]: i + 1, [positionZ]: i + 1, [velocityX]: -i, [velocityY]: -i, [velocityZ]: -i };
        switch (i % 4) {
            case 0: commands.spawn({ ...values, [visible]: true, [enabled]: true }); break;
            case 1: commands.spawn({ ...values, [visible]: true }); break;
            case 2: commands.spawn({ ...values, [enabled]: true }); break;
            default: commands.spawn(values);
        }
    }
});
