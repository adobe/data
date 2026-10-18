import { Entity } from '../entity/entity.js';
import { Vec3 } from '../math/index.js';
import { Component } from './component.js';

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
const check = <_T extends true>() => { };

const position = Symbol("declarationTypeTest/position");
const score = Symbol("declarationTypeTest/score");
const parent = Symbol("declarationTypeTest/parent");
const follows = Symbol("declarationTypeTest/follows");
const tags = Symbol("declarationTypeTest/tags");
const weights = Symbol("declarationTypeTest/weights");
const element = Symbol("declarationTypeTest/element");
const handle = Symbol("declarationTypeTest/handle");
const cache = Symbol("declarationTypeTest/cache");
const level = Symbol("declarationTypeTest/level");

// The declared traits are the source of truth; registration must give exactly them.
declare module '@adobe/data-ecs' {
    export interface Components {
        [position]: { type: Vec3 };
        [score]: { type: number };
        [parent]: { type: Entity; reference: "owner" };
        [follows]: { type: Entity; reference: "weak" };
        [tags]: { type: ReadonlySet<string> };
        [weights]: { type: ReadonlyMap<Entity, number> };
        [element]: { type: HTMLElement; thread: "main" };
        [handle]: { type: { readonly release: () => void } };
        [cache]: { type: Map<string, number> };
        [level]: { type: number; derived: true };
    }
}

Component.register(position, { type: Vec3.schema });
Component.register(score, { type: { type: "integer" } });
Component.register(parent, { type: Entity.schema, reference: "owner" });
Component.register(follows, { type: Entity.schema, reference: "weak" });
Component.register(tags, { type: { type: "set", items: { type: "string" } } });
Component.register(weights, { type: { type: "map", keys: Entity.schema, values: { type: "number" } } });
Component.register(level, { type: { type: "number", default: 0 }, derived: true });

// A schema describes exactly the declared type.
// @ts-expect-error a variable-length array isn't a Vec3
Component.register(position, { type: { type: "array", items: { type: "number" } } });
// @ts-expect-error a string isn't a number
Component.register(score, { type: { type: "string" } });
// @ts-expect-error a number's schema isn't an entity's
Component.register(parent, { type: { type: "integer" }, reference: "owner" });
// @ts-expect-error a set of numbers isn't a set of strings
Component.register(tags, { type: { type: "set", items: { type: "number" } } });
// @ts-expect-error an array isn't a set
Component.register(tags, { type: { type: "array", items: { type: "string" } } });
// @ts-expect-error a map's keys are entities
Component.register(weights, { type: { type: "map", keys: { type: "string" }, values: { type: "number" } } });

// Every declared trait is registered, with its declared value, and nothing undeclared is.
// @ts-expect-error a declared trait is missing
Component.register(parent, { type: Entity.schema });
// @ts-expect-error an undeclared trait is given
Component.register(score, { type: { type: "number" }, thread: "main" });
// @ts-expect-error an undeclared trait is given
Component.register(score, { type: { type: "number" }, derived: true });
// @ts-expect-error a trait's value differs from the declared one
Component.register(follows, { type: Entity.schema, reference: "owner" });
// A declaration held in a constant gets no excess property check, so the types name each undeclared trait.
const placed = { type: { type: "number" }, thread: "main" } as const;
// @ts-expect-error an undeclared trait is given
Component.register(score, placed);

// A type that's data is registered with its schema; one that isn't data has none, and is stored as it is.
// @ts-expect-error a number is data, so it has a schema
Component.register(score, {});
// @ts-expect-error a set of strings is data too
Component.register(tags, {});
Component.register(element, { thread: "main" });
Component.register(handle, {});
// A Set or Map changes in place, so it isn't data.
Component.register(cache, {});
// @ts-expect-error a value that isn't data has no schema
Component.register(handle, { type: { type: "object", properties: {} } });

// Value types are the declared ones.
check<Equal<Component.Value<typeof position>, Vec3>>();
check<Equal<Component.Value<typeof tags>, ReadonlySet<string>>>();
check<Equal<Component.Value<typeof weights>, ReadonlyMap<Entity, number>>>();
check<Equal<Component.Value<typeof element>, HTMLElement>>();
