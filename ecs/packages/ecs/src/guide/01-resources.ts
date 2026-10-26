// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity, System, World, type F32 } from "../index.js";

export const gravity = Symbol();
export const floor = Symbol();
export const names = Symbol();
export const audio = Symbol();
export const focused = Symbol();

// A type whose namespace gives the value it starts at.
export type Height = F32;
export const Height = { default: -Infinity } as const;

declare module "@adobe/ecs" {
    interface Resources {
        [gravity]: { type: number; default: -9.8 };
        [floor]: { type: Height };
        [names]: { type: ReadonlyMap<string, number> };
        // Not data: stored as it is.
        [audio]: { type: AudioContext | null };
        [focused]: { type: Entity };
    }
}

const read = System.create({ observer: true }, ({ resources }) =>
    [resources[gravity], resources[floor], resources[names], resources[audio], resources[focused]]);

export const main = async (): Promise<void> => {
    await using earth = World.create();
    await using moon = World.create({ [gravity]: -1.6 });
    console.log(await earth.run(read));
    console.log(await moon.run(read));
};
