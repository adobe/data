import { Component, Entity, Resource, Trait } from "../index.js";

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
const check = <_T extends true>() => { };

const slot = Symbol("slot");
const ready = Symbol("ready");
const parent = Symbol("parent");
const total = Symbol("total");

// Traits are the fields of a key's record; type is one. Registration gives them again.
declare module "@adobe/data-ecs" {
    interface Components {
        // Only rules add and remove it.
        [slot]: { type: number; derived: true };
        // Present only while slot is.
        [ready]: { type: number; within: typeof slot };
        // Despawned with the entity it points to ("weak" removes the component instead).
        [parent]: { type: Entity; reference: "owner" };
    }
    interface Resources {
        // Systems contribute to it with this operator.
        [total]: { type: number; reduce: "+" };
    }
}

Component.register(slot, { type: { type: "number", default: 0 }, derived: true });
Component.register(ready, { type: { type: "number" }, within: slot });
Component.register(parent, { type: Entity.schema, reference: "owner" });
Resource.register(total, { type: { type: "number", default: 0 }, reduce: "+" });

// A trait of your own is a member of Traits<N>: the value it allows on key N, or never where it doesn't apply.
export const instanced = Symbol("instanced");
declare module "@adobe/data-ecs" {
    interface Traits<N> {
        readonly [instanced]: N extends Component.Key ? ([Component.Value<N>] extends [readonly number[]] ? true : never) : never;
    }
}
Trait.register(instanced);

const transform = Symbol("transform");
declare module "@adobe/data-ecs" {
    interface Components {
        [transform]: { type: readonly [number, number, number]; [instanced]: true };
    }
}
Component.register(transform, { type: { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 }, [instanced]: true });

// Types select components by trait.
type Keys = typeof slot | typeof ready | typeof parent | typeof transform;
check<Equal<Extract<Component.With<typeof instanced>, Keys>, typeof transform>>();
check<Equal<Extract<Component.With<"derived">, Keys>, typeof slot>>();
check<Equal<Extract<Component.With<"reference", "owner">, Keys>, typeof parent>>();
