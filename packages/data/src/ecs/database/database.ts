// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Archetype, ArchetypeId, ReadonlyArchetype } from "../archetype/index.js";
import { ResourceComponents } from "../store/resource-components.js";
import { ReadonlyStore, Store } from "../store/index.js";
import { Entity } from "../entity/entity.js";
import { EntityReadValues } from "../store/core/index.js";
import { Observe } from "../../observe/index.js";
import { TransactionResult } from "./transactional-store/index.js";
import { StringKeyof } from "../../types/types.js";
import { Components } from "../store/components.js";
import { ArchetypeComponents } from "../store/archetype-components.js";
import { RequiredComponents } from "../required-components.js";
import { EntitySelectOptions } from "../store/entity-select-options.js";
import type { Service } from "../../service/index.js";
import { createDatabase } from "./public/create-database.js";
import { observeSelectDeep as _observeSelectDeep } from "./public/observe-select-deep.js";
import { ResourceSchemas } from "../resource-schemas.js";
import { ComponentSchemas } from "../component-schemas.js";
import { FromSchemas } from "../../schema/index.js";
import type {
  TransactionDeclarations,
  TransactionFunctions,
  ToTransactionFunctions,
} from "../store/transaction-functions.js";
import type {
  ActionDeclarations,
  ActionFunctions,
  ToActionFunctions,
} from "../store/action-functions.js";
import { createPlugin } from "./create-plugin.js";
import { combinePlugins } from "./combine-plugins.js";

export type SystemFunction = () => void | Promise<void>;
export type SystemDeclaration = {
  readonly create: (db: Database<any, any, any, any, any, any> & { store: Store<any, any, any> }) => SystemFunction | void;
  /**
   * Scheduling constraints for system execution order.
   * - `before`: Hard constraint - this system must run before the listed systems
   * - `after`: Hard constraint - this system must run after the listed systems
   * - `during`: Soft constraint - prefer to run in the same tier as the listed systems, if dependencies allow
   */
  readonly schedule?: {
    readonly before?: readonly string[];
    readonly after?: readonly string[];
    readonly during?: readonly string[];
  }
}
export type SystemDeclarations<S extends string> = { readonly [K in S]: SystemDeclaration }

/**
 * Service factories map - functions that create services from the database.
 */
export type ServiceFactories<DB = any> = { readonly [K: string]: (db: DB) => unknown };

/**
 * Extracts service types from service factories.
 */
export type FromServiceFactories<SF> = {
  [K in keyof SF]: SF[K] extends (db: any) => infer R ? R : never
};

/**
 * Computed factories map - functions that create computed values from the database.
 * Used on Database and Plugin for flexible typing (return type unknown).
 */
export type ComputedFactories<DB = any> = { readonly [K: string]: (db: DB) => unknown };

/**
 * Extracts computed value types from computed factories.
 */
export type FromComputedFactories<CF> = {
  [K in keyof CF]: CF[K] extends (db: any) => infer R ? R : never
};

/**
 * Valid return type for a plugin computed factory.
 * Either a direct Observe<T> or a function with any args that returns Observe<T>.
 */
export type PluginComputedValue = Observe<unknown> | ((...args: any[]) => Observe<unknown>);

/**
 * Computed factories for plugin descriptors. Constrains each factory to return
 * a PluginComputedValue (direct observable or function returning observable).
 * Use this in createPlugin; Database keeps ComputedFactories (unknown) for flexibility.
 */
export type PluginComputedFactories<DB = any> = { readonly [K: string]: (db: DB) => PluginComputedValue };

export interface Database<
  C extends Components = {},
  R extends ResourceComponents = {},
  A extends ArchetypeComponents<StringKeyof<C>> = {},
  F extends TransactionFunctions = {},
  S extends string = never,
  AF extends ActionFunctions = {},
  SV = {},
  CV = unknown,
> extends ReadonlyStore<C, R, A>, Service {
  readonly transactions: F & Service;
  readonly actions: AF & Service;
  readonly services: SV;
  readonly computed: CV;
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
    /** System create() return value, or null when create() returns void. Key is always present. */
    readonly functions: { readonly [K in S]: SystemFunction | null };
    /** Tier order for execution. Looser type allows extended dbs to be assignable to base. */
    readonly order: ReadonlyArray<ReadonlyArray<string>>;
  }
  toData(): unknown
  fromData(data: unknown): void
  extend<P extends Database.Plugin>(plugin: P): Database<
    C & FromSchemas<P['components']>,
    R & FromSchemas<P['resources']>,
    A & P['archetypes'],
    F & ToTransactionFunctions<P['transactions']>,
    S | StringKeyof<P['systems']>,
    AF & ToActionFunctions<P['actions']>,
    SV & FromServiceFactories<P['services']>,
    CV & FromComputedFactories<P['computed']>
  >;
}

export namespace Database {
  /**
   * Converts a Plugin type to its corresponding Database type.
   * Uses direct property access (P['components']) instead of conditional inference
   * (P extends Plugin<infer CS, ...> ? CS : never) to avoid expensive 8-way type
   * expansion that amplifies TS7056 serialization overflow in deep extends chains.
   */
  export type FromPlugin<P extends Database.Plugin> = Database<
    FromSchemas<P['components']>,
    FromSchemas<P['resources']>,
    P['archetypes'],
    ToTransactionFunctions<P['transactions']>,
    StringKeyof<P['systems']>,
    ToActionFunctions<P['actions']>,
    FromServiceFactories<P['services']>,
    FromComputedFactories<P['computed']>
  >;

  export const create = createDatabase;

  export const is = (value: unknown): value is Database => {
    return value !== null && typeof value === "object" && "transactions" in value && "actions" in value && "store" in value && "observe" in value && "system" in value && "extend" in value;
  }

  export const observeSelectDeep = _observeSelectDeep;

  export type Plugin<
    CS extends ComponentSchemas = any,
    RS extends ResourceSchemas = any,
    A extends ArchetypeComponents<StringKeyof<CS>> = any,
    TD extends TransactionDeclarations<FromSchemas<CS>, FromSchemas<RS>, any> = any,
    S extends string = any,
    AD extends ActionDeclarations<FromSchemas<CS>, FromSchemas<RS>, A, ToTransactionFunctions<TD>, S> = any,
    SVF extends ServiceFactories = any,
    CVF extends ComputedFactories = any
  > = {
    readonly components: CS;
    readonly resources: RS;
    readonly archetypes: A;
    readonly transactions: TD;
    readonly systems: SystemDeclarations<S>;
    readonly actions: AD;
    readonly services: SVF;
    readonly computed: CVF;
  };

  export namespace Plugin {
    export const create = createPlugin;
    export const combine = combinePlugins;
    export type ToDatabase<P extends Database.Plugin> = Database.FromPlugin<P>;
    export type ToStore<P extends Database.Plugin> = Store<FromSchemas<P['components']>, FromSchemas<P['resources']>, P['archetypes']>;
    export type ToSystemDatabase<P extends Database.Plugin> = Database.FromPlugin<P> & {
      // Systems are allowed to access the database store directly.
      // This direct access will NOT trigger observable transactions.
      readonly store: Database.Plugin.ToStore<P>;
      // Systems are allowed to write to the services object directly.
      // This is dangerous and should only be done during initialization.
      services: { -readonly [K in keyof FromServiceFactories<P['services']>]: FromServiceFactories<P['services']>[K] };
    };
  }

}
