import { Component } from "../component/component.js";
import { System } from "../system/system.js";

// Mirrors adobe/data's ecs2 `create` perftest (packages/data/src/perftest/ecs2-perf.ts): 1M particles of eight scalar
// components, interleaved over four archetypes by visible/enabled, each with its own values.

const color = "flat/color";
const mass = "flat/mass";
const positionX = "flat/positionX";
const positionY = "flat/positionY";
const positionZ = "flat/positionZ";
const velocityX = "flat/velocityX";
const velocityY = "flat/velocityY";
const velocityZ = "flat/velocityZ";
export const visible = "flat/visible";
export const enabled = "flat/enabled";

declare module "../component/types.js" {
    export interface Types {
        [color]: number;
        [mass]: number;
        [positionX]: number;
        [positionY]: number;
        [positionZ]: number;
        [velocityX]: number;
        [velocityY]: number;
        [velocityZ]: number;
        [visible]: true;
        [enabled]: true;
    }
}
declare module "../system/types.js" {
    export interface Types {
        "flat/spawn": true;
        "flat/spawner": true;
    }
}

Component.register(color, { type: "integer", minimum: 0, maximum: 0xFFFFFFFF });
for (const key of [mass, positionX, positionY, positionZ, velocityX, velocityY, velocityZ] as const) Component.register(key, { type: "number", precision: 1 });
Component.register(visible, { const: true });
Component.register(enabled, { const: true });

/** Entity i goes to archetype i % 4, like ecs2's seedSingle. */
export const spawnFlat = System.create({ name: "flat/spawn", args: { type: "integer" } }, (_, { args }, commands) => {
    for (let i = 0; i < args; i++) {
        switch (i % 4) {
            case 0: commands.spawn({ [color]: 0xff00ff, [mass]: 10, [positionX]: i + 1, [positionY]: i + 1, [positionZ]: i + 1, [velocityX]: -i, [velocityY]: -i, [velocityZ]: -i, [visible]: true, [enabled]: true }); break;
            case 1: commands.spawn({ [color]: 0xff00ff, [mass]: 10, [positionX]: i + 1, [positionY]: i + 1, [positionZ]: i + 1, [velocityX]: -i, [velocityY]: -i, [velocityZ]: -i, [visible]: true }); break;
            case 2: commands.spawn({ [color]: 0xff00ff, [mass]: 10, [positionX]: i + 1, [positionY]: i + 1, [positionZ]: i + 1, [velocityX]: -i, [velocityY]: -i, [velocityZ]: -i, [enabled]: true }); break;
            default: commands.spawn({ [color]: 0xff00ff, [mass]: 10, [positionX]: i + 1, [positionY]: i + 1, [positionZ]: i + 1, [velocityX]: -i, [velocityY]: -i, [velocityZ]: -i });
        }
    }
});

const scalars = [color, mass, positionX, positionY, positionZ, velocityX, velocityY, velocityZ] as const;

/** The same spawns through `commands.spawner`, resolved once per shape. */
export const spawnFlatPrepared = System.create({ name: "flat/spawner", args: { type: "integer" } }, (_, { args }, commands) => {
    const spawners = [
        commands.spawner([...scalars, visible, enabled]),
        commands.spawner([...scalars, visible]),
        commands.spawner([...scalars, enabled]),
        commands.spawner(scalars),
    ] as const;
    for (let i = 0; i < args; i++) {
        switch (i % 4) {
            case 0: spawners[0]({ [color]: 0xff00ff, [mass]: 10, [positionX]: i + 1, [positionY]: i + 1, [positionZ]: i + 1, [velocityX]: -i, [velocityY]: -i, [velocityZ]: -i, [visible]: true, [enabled]: true }); break;
            case 1: spawners[1]({ [color]: 0xff00ff, [mass]: 10, [positionX]: i + 1, [positionY]: i + 1, [positionZ]: i + 1, [velocityX]: -i, [velocityY]: -i, [velocityZ]: -i, [visible]: true }); break;
            case 2: spawners[2]({ [color]: 0xff00ff, [mass]: 10, [positionX]: i + 1, [positionY]: i + 1, [positionZ]: i + 1, [velocityX]: -i, [velocityY]: -i, [velocityZ]: -i, [enabled]: true }); break;
            default: spawners[3]({ [color]: 0xff00ff, [mass]: 10, [positionX]: i + 1, [positionY]: i + 1, [positionZ]: i + 1, [velocityX]: -i, [velocityY]: -i, [velocityZ]: -i });
        }
    }
});
