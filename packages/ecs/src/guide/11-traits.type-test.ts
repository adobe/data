// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Component, Trait } from "../index.js";

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
const check = <_T extends true>() => { };

// A trait of your own is a member of Traits<N>: the value it allows on key N, or never where it doesn't apply.
export const instanced = Symbol("instanced");
declare module "@adobe/ecs" {
    interface Traits<N> {
        readonly [instanced]: N extends Component.Key ? ([Component.Value<N>] extends [readonly number[]] ? true : never) : never;
    }
}
Trait.register(instanced);

const transform = Symbol("transform");
const name = Symbol("name");
declare module "@adobe/ecs" {
    interface Components {
        [transform]: { type: readonly [number, number, number]; [instanced]: true };
        [name]: { type: string };
    }
}
Component.register(transform, { type: { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 }, [instanced]: true });
Component.register(name, { type: { type: "string" } });

// Types select components by trait.
check<Equal<Extract<Component.With<typeof instanced>, typeof transform | typeof name>, typeof transform>>();
