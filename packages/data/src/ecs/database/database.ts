// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Archetype, ArchetypeId, ReadonlyArchetype } from "../archetype/index.js";
import { ResourceComponents } from "../store/resource-components.js";
import { ReadonlyStore, Store } from "../store/index.js";
import { Entity } from "../entity.js";
import { EntityReadValues } from "../store/core/index.js";
import { Observe } from "../../observe/index.js";
import { TransactionResult } from "./transactional-store/index.js";
import { StringKeyof } from "../../types/types.js";
import { Components } from "../store/components.js";
import { ArchetypeComponents } from "../store/archetype-components.js";
import { RequiredComponents } from "../required-components.js";
import { EntitySelectOptions } from "../store/entity-select-options.js";
import { Service } from "../../service/service.js";
import { createDatabase } from "./public/create-database.js";
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
 * Computed factories for plugin descriptors. Constrains each factory to return
 * something that extends Observe<unknown>, so plugins declare observable computed values.
 * Use this in createPlugin; Database keeps ComputedFactories (unknown) for flexibility.
 */
export type PluginComputedFactories<DB = any> = { readonly [K: string]: (db: DB) => Observe<unknown> };

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
  extend<P extends Database.Plugin<any, any, any, any, any, any, any, any>>(plugin: P): Database<
    C & (P extends Database.Plugin<infer XC, any, any, any, any, any, any, any> ? FromSchemas<XC> : never),
    R & (P extends Database.Plugin<any, infer XR, any, any, any, any, any, any> ? FromSchemas<XR> : never),
    A & (P extends Database.Plugin<any, any, infer XA, any, any, any, any, any> ? XA : never),
    F & (P extends Database.Plugin<any, any, any, infer XTD, any, any, any, any> ? ToTransactionFunctions<XTD> : never),
    S | (P extends Database.Plugin<any, any, any, any, infer XS, any, any, any> ? XS : never),
    AF & (P extends Database.Plugin<any, any, any, any, any, infer XAD, any, any> ? ToActionFunctions<XAD> : never),
    SV & (P extends Database.Plugin<any, any, any, any, any, any, infer XSVF, any> ? FromServiceFactories<XSVF> : never),
    CV & (P extends Database.Plugin<any, any, any, any, any, any, any, infer XCVF> ? FromComputedFactories<XCVF> : never)
  >;
}

export namespace Database {
  /** Stepwise inference helpers - each infers one Plugin param to reduce compiler depth. */
  type FromPluginComponents<P> = P extends Database.Plugin<infer CS, any, any, any, any, any, any, any> ? CS : never;
  type FromPluginResources<P> = P extends Database.Plugin<any, infer RS, any, any, any, any, any, any> ? RS : never;
  type FromPluginArchetypes<P> = P extends Database.Plugin<any, any, infer A, any, any, any, any, any> ? A : never;
  type FromPluginTransactions<P> = P extends Database.Plugin<any, any, any, infer TD, any, any, any, any> ? TD : never;
  type FromPluginSystems<P> = P extends Database.Plugin<any, any, any, any, infer S, any, any, any> ? S : never;
  type FromPluginActions<P> = P extends Database.Plugin<any, any, any, any, any, infer AD, any, any> ? AD : never;
  type FromPluginServices<P> = P extends Database.Plugin<any, any, any, any, any, any, infer SVF, any> ? SVF : never;
  type FromPluginComputed<P> = P extends Database.Plugin<any, any, any, any, any, any, any, infer CVF> ? CVF : never;

  export type FromPlugin<P extends Database.Plugin> = P extends Database.Plugin
    ? Database<
        FromSchemas<FromPluginComponents<P>>,
        FromSchemas<FromPluginResources<P>>,
        FromPluginArchetypes<P>,
        ToTransactionFunctions<FromPluginTransactions<P>>,
        FromPluginSystems<P>,
        ToActionFunctions<FromPluginActions<P>>,
        FromServiceFactories<FromPluginServices<P>>,
        FromComputedFactories<FromPluginComputed<P>>
      >
    : never;

  export const create = createDatabase;

  export const is = (value: unknown): value is Database => {
    return value !== null && typeof value === "object" && "transactions" in value && "actions" in value && "store" in value && "observe" in value && "system" in value && "extend" in value;
  }

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
    export type ToSystemDatabase<P extends Database.Plugin> = Database.FromPlugin<P> & { readonly store: Database.Plugin.ToStore<P> };
  }

}
