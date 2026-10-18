import { Component, Resource } from "@adobe/data-ecs";
import type { Key as TraitKey } from "../trait/key.js";

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
Component.register(position, { type: { type: "number" } });
Resource.register(scale, { type: { type: "number", default: 0 } });

// Components, resources and traits are named by keys; systems, rules and finalizers by names.
export const component: Component.Key = position;
export const resource: Resource.Key = scale;
export const trait: TraitKey = mark;
export const builtIn: TraitKey = "derived";
// @ts-expect-error a resource isn't a component
export const resourceAsComponent: Component.Key = scale;
// @ts-expect-error a component isn't a resource
export const componentAsResource: Resource.Key = position;
// @ts-expect-error only the core's traits are named by strings
export const unknownTrait: TraitKey = "unknown";
