// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Component } from "../interface/component/component.js";
import { System } from "../interface/system/system.js";
import { Archetype } from '../interface/archetype/archetype.js';

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
Component.register(mass, { type: { type: "number", precision: 1 } });
Component.register(positionX, { type: { type: "number", precision: 1 } });
Component.register(positionY, { type: { type: "number", precision: 1 } });
Component.register(positionZ, { type: { type: "number", precision: 1 } });
Component.register(velocityX, { type: { type: "number", precision: 1 } });
Component.register(velocityY, { type: { type: "number", precision: 1 } });
Component.register(velocityZ, { type: { type: "number", precision: 1 } });
Component.register(visible, { type: { const: true } });
Component.register(enabled, { type: { const: true } });

const scalars = [color, mass, positionX, positionY, positionZ, velocityX, velocityY, velocityZ] as const;
/** Entity i goes to archetype i % 4, like ecs2's seedSingle. */
const archetypes = [
    Archetype.create([...scalars, visible, enabled]),
    Archetype.create([...scalars, visible]),
    Archetype.create([...scalars, enabled]),
    Archetype.create(scalars),
] as const;

/** Spawns with values passed inline. */
export const spawnFlat = System.create({ name: "flat/spawn" }, ({ commands }, input: { readonly count: number }) => {
    for (let i = 0; i < input.count; i++) {
        commands.spawn(archetypes[i % 4])({ [color]: 0xff00ff, [mass]: 10, [positionX]: i + 1, [positionY]: i + 1, [positionZ]: i + 1, [velocityX]: -i, [velocityY]: -i, [velocityZ]: -i });
    }
});

/** The same spawns with each value object built first, as values from data or from another system's results are. */
export const spawnFlatDynamic = System.create({ name: "flat/dynamic" }, ({ commands }, input: { readonly count: number }) => {
    for (let i = 0; i < input.count; i++) {
        const values = { [color]: 0xff00ff, [mass]: 10, [positionX]: i + 1, [positionY]: i + 1, [positionZ]: i + 1, [velocityX]: -i, [velocityY]: -i, [velocityZ]: -i };
        commands.spawn(archetypes[i % 4])(values);
    }
});
