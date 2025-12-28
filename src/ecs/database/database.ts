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

import { Archetype, ArchetypeId, ReadonlyArchetype } from "../archetype/index.js";
import { ResourceComponents } from "../store/resource-components.js";
import { ReadonlyStore, Store } from "../store/index.js";
import { Entity } from "../entity.js";
import { EntityReadValues } from "../store/core/index.js";
import { Observe } from "../../observe/index.js";
import { TransactionResult } from "./transactional-store/index.js";
import { IntersectTuple, NoInfer, StringKeyof } from "../../types/types.js";
import { Components } from "../store/components.js";
import { ArchetypeComponents } from "../store/archetype-components.js";
import { RequiredComponents } from "../required-components.js";
import { EntitySelectOptions } from "../store/entity-select-options.js";
import { Service } from "../../service/service.js";
import { createDatabase } from "./public/create-database.js";
import { ResourceSchemas } from "../resource-schemas.js";
import { ComponentSchemas } from "../component-schemas.js";
import { FromSchemas } from "../../schema/index.js";
import { Assert } from "../../types/assert.js";
import { Equal } from "../../types/equal.js";
import type {
  ActionDeclarations,
  ActionFunctions,
  ToActionFunctions,
} from "../store/action-functions.js";
import { createPlugin } from "./create-plugin.js";

export type SystemFunction = () => void | Promise<void>;

export interface Database<
  C extends Components,
  R extends ResourceComponents,
  A extends ArchetypeComponents<StringKeyof<C>>,
  F extends ActionFunctions,
  S extends string = never,
> extends ReadonlyStore<C, R, A>, Service {
  readonly transactions: F & Service;
  /**
   * Provides direct mutable access to the underlying store.
   */
  readonly store: Store<C, R, A> & {
    /**
     * Provides fast access to the action functions without a transaction wrapper.
     * This means any calls to them will NOT be observable or undoable.
     */
    readonly actions: F;
  }
  readonly observe: {
    readonly components: { readonly [K in StringKeyof<C>]: Observe<void> };
    readonly resources: { readonly [K in StringKeyof<R>]: Observe<R[K]> };
    readonly transactions: Observe<TransactionResult<C>>;
    entity<T extends RequiredComponents>(id: Entity, minArchetype?: ReadonlyArchetype<T> | Archetype<T>): Observe<{ readonly [K in (StringKeyof<RequiredComponents & T>)]: (RequiredComponents & T)[K] } & EntityReadValues<C> | null>;
    entity(id: Entity): Observe<EntityReadValues<C> | null>;
    archetype(id: ArchetypeId): Observe<void>;
    select<
      Include extends StringKeyof<C>,
      T extends Include
    >(
      include: readonly Include[] | ReadonlySet<string>,
      options?: EntitySelectOptions<C, Pick<C & RequiredComponents, T>>
    ): Observe<readonly Entity[]>;
  }
  readonly system: {
    readonly functions: { readonly [K in S]: SystemFunction };
    readonly order: S[][];
  }
  toData(): unknown
  fromData(data: unknown): void
  extend<P extends Database.Plugin<any, any, any, any, any>>(plugin: P): Database<
    C & (P extends Database.Plugin<infer XC, any, any, any, any> ? FromSchemas<XC> : never),
    R & (P extends Database.Plugin<any, infer XR, any, any, any> ? FromSchemas<XR> : never),
    A & (P extends Database.Plugin<any, any, infer XA, any, any> ? XA : never),
    F & (P extends Database.Plugin<any, any, any, infer XTD, any> ? ToActionFunctions<XTD> : never),
    S | (P extends Database.Plugin<any, any, any, any, infer XS> ? XS : never)
  >;
}

export namespace Database {
  export const create = createDatabase;

  export type Plugin<
    CS extends ComponentSchemas = any,
    RS extends ResourceSchemas = any,
    A extends ArchetypeComponents<StringKeyof<CS>> = any,
    TD extends ActionDeclarations<FromSchemas<CS>, FromSchemas<RS>, any> = any,
    S extends string = any
  > = {
    readonly components?: CS;
    readonly resources?: RS;
    readonly archetypes?: A;
    readonly transactions?: TD;
    readonly systems?: { readonly [K in S]: {
      readonly create: (db: Database<FromSchemas<CS>, FromSchemas<RS>, A, ToActionFunctions<TD>, S>) => SystemFunction;
      /**
       * Scheduling constraints for system execution order.
       * - `before`: Hard constraint - this system must run before the listed systems
       * - `after`: Hard constraint - this system must run after the listed systems
       * - `during`: Soft constraint - prefer to run in the same tier as the listed systems, if dependencies allow
       */
      readonly schedule?: {
        readonly before?: readonly NoInfer<Exclude<S, K>>[];
        readonly after?: readonly NoInfer<Exclude<S, K>>[];
        readonly during?: readonly NoInfer<Exclude<S, K>>[];
      }
    } };
  };

  export namespace Plugin {

    export type Intersect<T extends readonly Plugin<any, any, any, any, any>[]> =
      Required<Database.Plugin<
        {} & IntersectTuple<{ [K in keyof T]: T[K] extends Plugin<infer C, any, any, any, any> ? (C extends undefined ? {} : C) : never }>,
        {} & IntersectTuple<{ [K in keyof T]: T[K] extends Plugin<any, infer R, any, any, any> ? (R extends undefined ? {} : R) : never }>,
        {} & IntersectTuple<{ [K in keyof T]: T[K] extends Plugin<any, any, infer A, any, any> ? (A extends undefined ? {} : A) : never }>,
        {} & IntersectTuple<{ [K in keyof T]: T[K] extends Plugin<any, any, any, infer TD, any> ? (TD extends undefined ? Record<never, never> : TD) : never }>,
        Extract<{ [K in keyof T]: T[K] extends Plugin<any, any, any, any, infer S> ? S : never }[number], string>
      >>

    export const create = createPlugin;
  }

}

// Type tests for Database.Plugin.Intersect
type TestPlugin1 = Database.Plugin<
  { position: { type: "number" } },
  { mousePos: { default: 0 } },
  {},
  {},
  never
>;
type TestPlugin2 = Database.Plugin<
  { velocity: { type: "number" } },
  { delta: { default: 0 } },
  {},
  {},
  never
>;
type TestPlugin3 = Database.Plugin<
  { mass: { type: "number" } },
  { gravity: { default: 0 } },
  {},
  {},
  never
>;

type TestIntersect = Database.Plugin.Intersect<[TestPlugin1, TestPlugin2, TestPlugin3]>;
type CheckIntersectComponents = Assert<Equal<TestIntersect["components"], {
  position: { type: "number" };
  velocity: { type: "number" };
  mass: { type: "number" };
}>>;
type CheckIntersectResources = Assert<Equal<TestIntersect["resources"], {
  mousePos: { default: 0 };
  delta: { default: 0 };
  gravity: { default: 0 };
}>>;

// Test that archetypes can reference components from dependencies
type BasePlugin = Database.Plugin<
  { position: { type: "number" }, health: { type: "number" } },
  {},
  {},
  {},
  never
>;

// Test type inference with new overload pattern
const testBasePlugin = Database.Plugin.create({
  components: {
    position: { type: "number" },
    health: { type: "number" }
  }
});

const testExtendedPlugin = Database.Plugin.create(
  {
    components: {
      velocity: { type: "number" }
    },
    archetypes: {
      DynamicEntity: ["position", "velocity"],
      LivingEntity: ["position", "health"]
    }
  },
  [testBasePlugin]
);

type ExtendedPluginResult = typeof testExtendedPlugin;
type Ignore = ExtendedPluginResult["components"]

// TODO: Fix type test after World->Database merge
// type CheckExtendedHasAllComponents = Assert<Equal<ExtendedPluginResult["components"], {
//   position: { type: "number" };
//   health: { type: "number" };
//   velocity: { type: "number" };
// }>>;

type TestTransactionFunctions = ToActionFunctions<{
  test1: (db: Store<any, any>, arg: number) => void;
  test2: (db: Store<any, any>) => void;
}>
