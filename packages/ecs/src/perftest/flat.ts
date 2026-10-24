// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "../interface/system/system.js";
import { Archetype } from '../interface/archetype/archetype.js';
import type { F32, U32 } from '../interface/math/index.js';

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

declare module "@adobe/ecs" {
    export interface Components {
        [color]: { type: U32 };
        [mass]: { type: F32 };
        [positionX]: { type: F32 };
        [positionY]: { type: F32 };
        [positionZ]: { type: F32 };
        [velocityX]: { type: F32 };
        [velocityY]: { type: F32 };
        [velocityZ]: { type: F32 };
        [visible]: { type: true };
        [enabled]: { type: true };
    }
}


const scalars = [color, mass, positionX, positionY, positionZ, velocityX, velocityY, velocityZ] as const;
/** Entity i goes to archetype i % 4, like ecs2's seedSingle. */
const archetypes = [
    Archetype.create([...scalars, visible, enabled]),
    Archetype.create([...scalars, visible]),
    Archetype.create([...scalars, enabled]),
    Archetype.create(scalars),
] as const;

/** Spawns with values passed inline. */
export const spawnFlat = System.create({}, ({ commands }, input: { readonly count: number }) => {
    for (let i = 0; i < input.count; i++) {
        commands.spawn(archetypes[i % 4])({ [color]: 0xff00ff, [mass]: 10, [positionX]: i + 1, [positionY]: i + 1, [positionZ]: i + 1, [velocityX]: -i, [velocityY]: -i, [velocityZ]: -i });
    }
});

/** The same spawns with each value object built first, as values from data or from another system's results are. */
export const spawnFlatDynamic = System.create({}, ({ commands }, input: { readonly count: number }) => {
    for (let i = 0; i < input.count; i++) {
        const values = { [color]: 0xff00ff, [mass]: 10, [positionX]: i + 1, [positionY]: i + 1, [positionZ]: i + 1, [velocityX]: -i, [velocityY]: -i, [velocityZ]: -i };
        commands.spawn(archetypes[i % 4])(values);
    }
});
