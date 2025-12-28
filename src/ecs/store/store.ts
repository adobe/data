/*MIT License

© Copyright 2025 Adobe. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.*/
import { RequiredComponents } from "../required-components.js";
import { ResourceComponents } from "./resource-components.js";
import { Core, ReadonlyCore } from "./core/core.js";
import { Entity } from "../entity.js";
import { IntersectTuple, Simplify, StringKeyof } from "../../types/types.js";
import { Components } from "./components.js";
import { ArchetypeComponents } from "./archetype-components.js";
import { Archetype, ReadonlyArchetype } from "../archetype/archetype.js";
import { EntitySelectOptions } from "./entity-select-options.js";
import { Undoable } from "../database/undoable.js";
import { Assert } from "../../types/assert.js";
import { Equal } from "../../types/equal.js";
import { FromSchemas } from "../../schema/from-schemas.js";
import { ComponentSchemas } from "../component-schemas.js";
import { ResourceSchemas } from "../resource-schemas.js";
import { createStore } from "./public/create-store.js";
import { OptionalComponents } from "../optional-components.js";

interface BaseStore<C extends object = never> {
    select<
        Include extends StringKeyof<C & OptionalComponents>
    >(
        include: readonly Include[] | ReadonlySet<string>,
        options?: EntitySelectOptions<C & OptionalComponents, Pick<C & RequiredComponents & OptionalComponents, Include>>
    ): readonly Entity[];
    toData(): unknown
}

export interface ReadonlyStore<
    C extends Components = never,
    R extends ResourceComponents = never,
    A extends ArchetypeComponents<StringKeyof<C>> = never,
> extends BaseStore<C>, ReadonlyCore<C> {
    readonly resources: { readonly [K in StringKeyof<R>]: R[K] };
    readonly archetypes: { readonly [K in StringKeyof<A>]: ReadonlyArchetype<RequiredComponents & { [P in A[K][number]]: (C & RequiredComponents & OptionalComponents)[P] }> }
}

export type ToReadonlyStore<T extends Store> = T extends Store<infer C, infer R> ? ReadonlyStore<C, R> : never;

/**
 * Store is the main interface for storing components, entities and resources.
 */
export interface Store<
    C extends Components = {},
    R extends ResourceComponents = {},
    A extends ArchetypeComponents<StringKeyof<C>> = {},
> extends BaseStore<C>, Core<C> {
    /**
     * This is used when a store is used to represent a transaction.
     * For most stores, this is ignored if it is set.
     */
    undoable?: Undoable;
    readonly resources: { -readonly [K in StringKeyof<R>]: R[K] };
    readonly archetypes: { -readonly [K in StringKeyof<A>]: Archetype<RequiredComponents & { [P in A[K][number]]: (C & RequiredComponents & OptionalComponents)[P] }> }
    fromData(data: unknown): void
    extend<S extends Store.Schema>(schema: S): S extends Store.Schema<infer XC, infer XR, infer XA> ? Store<C & XC, R & XR, A & XA> : never;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Store {
    export type Components<S extends Store> = S extends Store<infer C, infer R, infer A> ? C : never;
    export type Resources<S extends Store> = S extends Store<any, infer R, any> ? R : never;
    export type Archetypes<S extends Store> = S extends Store<any, any, infer A> ? A : never;
    export type EntityValues<S extends Store<any, any, any>, K extends S extends Store<any, any, infer A> ? StringKeyof<A> : never> = Simplify<Parameters<S["archetypes"][K]["insert"]>[0] & RequiredComponents>;
    export type InsertValues<S extends Store<any, any, any>, K extends S extends Store<any, any, infer A> ? StringKeyof<A> : never> = Parameters<S["archetypes"][K]["insert"]>[0];

    export type Schema<
        CS extends ComponentSchemas = any,
        RS extends ResourceSchemas = any,
        A extends ArchetypeComponents<StringKeyof<CS>> = any,
    > = {
        readonly components: CS;
        readonly resources: RS;
        readonly archetypes: A;
    };

    export type FromSchema<T> = T extends Store.Schema<infer CS, infer RS, infer A> ? Store<FromSchemas<CS>, FromSchemas<RS>, A> : never;

    export namespace Schema {

        export type Intersect<T extends readonly Schema<any, any, any>[]> =
            Store.Schema<
                {} & IntersectTuple<{ [K in keyof T]: T[K] extends Schema<infer C, infer R, infer A> ? C : never }>,
                {} & IntersectTuple<{ [K in keyof T]: T[K] extends Schema<any, infer R, any> ? R : never }>,
                {} & IntersectTuple<{ [K in keyof T]: T[K] extends Schema<any, any, infer A> ? A : never }>
            >

        type S = Intersect<[Store.Schema<{ a: { type: "number" } }, { b: { default: "string" } }, {}>, Store.Schema<{ c: { type: "number" } }, { d: { default: "string" } }, {}>, Store.Schema<{ e: { type: "number" } }, { f: { default: "string" } }, {}>]>
        type CheckIntersect = Assert<Equal<S, {
            readonly components: {
                a: {
                    type: "number";
                };
                c: {
                    type: "number";
                };
                e: {
                    type: "number";
                };
            };
            readonly resources: {
                b: {
                    default: "string";
                };
                d: {
                    default: "string";
                };
                f: {
                    default: "string";
                };
            };
            readonly archetypes: {};
        }>>;

        /**
         * Creates a Store schema with optional properties. All schema properties
         * (components, resources, archetypes) are optional and default to empty
         * objects when not provided.
         * 
         * @param schema - Partial store schema. Omit any properties you don't need.
         * @param dependencies - Optional array of schemas to merge with. Properties from
         *                       dependencies are merged with the schema, with dependencies
         *                       taking precedence for overlapping properties.
         * @returns The merged schema with all properties from the schema and dependencies
         * 
         * @example
         * ```typescript
         * // Minimal schema with only components
         * const schema = Store.Schema.create({
         *   components: {
         *     position: { type: "number" }
         *   }
         * });
         * 
         * // Schema with dependencies
         * const extended = Store.Schema.create({
         *   components: { velocity: { type: "number" } }
         * }, [baseSchema]);
         * ```
         */
        export function create<
            const CS extends ComponentSchemas = {},
            const RS extends ResourceSchemas = {},
            const A extends ArchetypeComponents<StringKeyof<CS& Intersect<D>["components"]>> = {},
            const D extends readonly Store.Schema<any, any, any>[] = [],
        >(
            schema: Partial<{
                components: CS;
                resources: RS;
                archetypes: A;
            }>,
            dependencies?: D
        ): Intersect<[Store.Schema<CS & Intersect<D>["components"], RS, A>, ...D]> {
            const { components = {}, resources = {}, archetypes = {} } = schema;
            return (dependencies ?? []).reduce((acc, curr) => {
                return {
                    components: { ...acc.components, ...curr.components },
                    resources: { ...acc.resources, ...curr.resources },
                    archetypes: { ...acc.archetypes, ...curr.archetypes },
                }
            },
                { components, resources, archetypes } as any
            );
        }

    }

    export const create = createStore;
}

type Foo = Store<{ a: number, b: string }, {}, { one: ["a", "b"] }>
type CheckEntityValues = Assert<Equal<Store.EntityValues<Foo, "one">, {
    id: number;
    a: number;
    b: string;
}>>;
type CheckInsertValues = Assert<Equal<Store.InsertValues<Foo, "one">, {
    a: number;
    b: string;
}>>;

type CheckStoreFromSchema = Store.FromSchema<Store.Schema<{
    velocity: { type: "number" },
    particle: { type: "boolean" },
}, {
    mousePosition: { type: "number", default: 0 },
    fooPosition: { type: "number", default: 0 },
}, {
    Particle: ["particle"],
    DynamicParticle: ["particle", "velocity"],
}>>;
declare const testStore: CheckStoreFromSchema;
type A = typeof testStore.archetypes.DynamicParticle;
type CheckDynamicParticle = Assert<Equal<typeof testStore.archetypes.DynamicParticle, Archetype<RequiredComponents & {
    particle: boolean;
    velocity: number;
}>>>;
type CheckParticle = Assert<Equal<typeof testStore.archetypes.Particle, Archetype<RequiredComponents & {
    particle: boolean;
}>>>;
