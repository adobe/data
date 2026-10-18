import { Component, Trait } from "../index.js";

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
const check = <_T extends true>() => { };

// A trait of your own is a member of Traits<N, E>: the value it allows on key N, whose traits are E, or never where
// it doesn't apply.
export const instanced = Symbol("instanced");
declare module "@adobe/data-ecs" {
    interface Traits<N, E> {
        readonly [instanced]: N extends Component.Key ? ([E["type"]] extends [readonly number[]] ? true : never) : never;
    }
}
Trait.register(instanced);

const transform = Symbol("transform");
const name = Symbol("name");
const transformTraits = Component.register(transform, { type: { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 }, [instanced]: true });
const nameTraits = Component.register(name, { type: { type: "string" } });
declare module "@adobe/data-ecs" {
    interface Components {
        [transform]: typeof transformTraits;
        [name]: typeof nameTraits;
    }
}

// Types select components by trait.
check<Equal<Extract<Component.With<typeof instanced>, typeof transform | typeof name>, typeof transform>>();
