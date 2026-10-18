import { Component, Resource, Trait } from "@adobe/data-ecs";

const position = Symbol("keyTypeTest/position");
const scale = Symbol("keyTypeTest/scale");
const mark = Symbol("keyTypeTest/mark");
declare module "@adobe/data-ecs" {
    interface Components {
        [position]: { type: number };
    }
    interface Resources {
        [scale]: { type: number };
    }
    interface Traits<N> {
        readonly [mark]: true;
    }
}

// Components, resources and traits are named by keys; systems, rules and finalizers by names.
export const component: Component.Key = position;
export const resource: Resource.Key = scale;
export const trait: Trait.Key = mark;
export const builtIn: Trait.Key = "derived";
// @ts-expect-error a resource isn't a component
export const resourceAsComponent: Component.Key = scale;
// @ts-expect-error a component isn't a resource
export const componentAsResource: Resource.Key = position;
// @ts-expect-error only the core's traits are named by strings
export const unknownTrait: Trait.Key = "unknown";
