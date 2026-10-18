import { Component, Entity, Trait, type System } from "../index.js";

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
const check = <_T extends true>() => { };

// A trait is a member of `Traits<N>`: the value it allows on component `N`, or `never` where it doesn't apply.
// It is declared by augmenting `Traits`, and claims the name with `Trait.register`.
export const instanced = Symbol("guide/traits/instanced");
declare module "@adobe/data-ecs" {
    interface Traits<N> {
        readonly [instanced]: N extends Component.Key ? ([Component.Value<N>] extends [readonly number[]] ? true : never) : never;
    }
}
Trait.register(instanced);

const transform = Symbol("guide/traits/transform");
const label = Symbol("guide/traits/label");
const meshSlot = Symbol("guide/traits/meshSlot");
const meshReady = Symbol("guide/traits/meshReady");
const parent = Symbol("guide/traits/parent");

// Each component's record lists all its traits, `type` among them.
declare module "@adobe/data-ecs" {
    interface Components {
        [transform]: { type: readonly [number, number, number]; [instanced]: true };
        [label]: { type: string };
        [meshSlot]: { type: number; derived: true };
        [meshReady]: { type: number; within: typeof meshSlot };
        [parent]: { type: Entity; reference: "owner" };
    }
}

// Registration gives exactly those traits, `type` as a schema for the declared type.
Component.register(transform, { type: { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 }, [instanced]: true });
Component.register(label, { type: { type: "string" } });
Component.register(meshSlot, { type: { type: "number", default: 0 }, derived: true });
Component.register(meshReady, { type: { type: "number" }, within: meshSlot });
Component.register(parent, { type: Entity.schema, reference: "owner" });

// @ts-expect-error a trait's allowed value depends on the component: `instanced` takes only number arrays
Component.register(label, { type: { type: "string" }, [instanced]: true });

// Types filter components by their traits and value types.
type Guide = typeof transform | typeof label | typeof meshSlot | typeof meshReady | typeof parent;
check<Equal<Extract<Component.With<typeof instanced>, Guide>, typeof transform>>();
check<Equal<Extract<Component.With<"derived">, Guide>, typeof meshSlot>>();
check<Equal<Extract<Component.With<"reference", "owner">, Guide>, typeof parent>>();

export const spawn = (commands: System.Commands): void => {
    // @ts-expect-error only rules add and remove derived components
    commands.spawn([meshSlot])({ [meshSlot]: 1 });
};
