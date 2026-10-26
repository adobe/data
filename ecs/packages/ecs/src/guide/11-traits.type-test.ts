// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Component } from "../index.js";

// A trait of your own: true for components whose values are lists of numbers, never for others.
export const instanced = Symbol();
declare module "@adobe/ecs" {
    interface Traits<N> {
        readonly [instanced]: N extends Component.Key ? ([Component.Value<N>] extends [readonly number[]] ? true : never) : never;
    }
}

const transform = Symbol();
const name = Symbol();
declare module "@adobe/ecs" {
    interface Components {
        [transform]: { type: readonly [number, number, number]; [instanced]: true };
        [name]: { type: string };
    }
}

const instance = (key: Component.With<typeof instanced>): Component.Key => key;
instance(transform);
// @ts-expect-error: name isn't instanced. Without this line, TypeScript reports:
// Argument of type 'typeof name' is not assignable to parameter of type 'typeof transform'.
instance(name);
