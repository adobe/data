import { Component, Entity, Trait, type System } from "../index.js";

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
const check = <_T extends true>() => { };

// A trait is a member of `Trait.Types<N>`: the value it allows on component `N`, or `never` where it doesn't apply.
// An application augments "@adobe/data-ecs/trait/types", and claims the name with `Trait.register`.
export const instanced = "guide/traits/instanced";
declare module "../trait/types.js" {
    interface Types<N> {
        readonly [instanced]: N extends Component.Name ? ([Component.Value<N>] extends [readonly number[]] ? true : never) : never;
    }
}
Trait.register(instanced);

const transform = "guide/traits/transform";
const label = "guide/traits/label";
const meshSlot = "guide/traits/meshSlot";
const meshReady = "guide/traits/meshReady";
const parent = "guide/traits/parent";

// Each component's record lists all its traits, `type` among them.
declare module "../component/types.js" {
    interface Types {
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
check<Equal<Extract<Component.Where<Entity>, Guide>, typeof parent>>();
check<Equal<Extract<Component.Derived, Guide>, typeof meshSlot>>();
// Commands take only essential components, and systems write only writable ones.
check<Equal<Extract<Component.Essential, Guide>, Exclude<Guide, typeof meshSlot>>>();
check<Equal<Extract<Component.Writable, Guide>, Exclude<Guide, typeof parent>>>();

export const spawn = (commands: System.Commands): void => {
    // @ts-expect-error only rules add and remove derived components
    commands.spawn({ [meshSlot]: 1 });
};
