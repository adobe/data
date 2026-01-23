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

export interface Database<
  C extends Components = {},
  R extends ResourceComponents = {},
  A extends ArchetypeComponents<StringKeyof<C>> = {},
  F extends TransactionFunctions = {},
  S extends string = never,
  AF extends ActionFunctions = {},
> extends ReadonlyStore<C, R, A>, Service {
  readonly transactions: F & Service;
  readonly actions: AF & Service;  
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
  extend<P extends Database.Plugin<any, any, any, any, any, any>>(plugin: P): Database<
    C & (P extends Database.Plugin<infer XC, any, any, any, any, any> ? FromSchemas<XC> : never),
    R & (P extends Database.Plugin<any, infer XR, any, any, any, any> ? FromSchemas<XR> : never),
    A & (P extends Database.Plugin<any, any, infer XA, any, any, any> ? XA : never),
    F & (P extends Database.Plugin<any, any, any, infer XTD, any, any> ? ToTransactionFunctions<XTD> : never),
    S | (P extends Database.Plugin<any, any, any, any, infer XS, any> ? XS : never),
    AF & (P extends Database.Plugin<any, any, any, any, any, infer XAD> ? ToActionFunctions<XAD> : never)
  >;
}

export namespace Database {
  export type FromPlugin<P extends Database.Plugin> = P extends Database.Plugin<infer CS, infer RS, infer A, infer TD, infer S, infer AD> ? Database<FromSchemas<CS>, FromSchemas<RS>, A, ToTransactionFunctions<TD>, S, ToActionFunctions<AD>> : never;

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
    AD extends ActionDeclarations<FromSchemas<CS>, FromSchemas<RS>, A, ToTransactionFunctions<TD>, S> = any
  > = {
    readonly components: CS;
    readonly resources: RS;
    readonly archetypes: A;
    readonly transactions: TD;
    readonly systems: SystemDeclarations<S>;
    readonly actions: AD;
  };

  export namespace Plugin {
    export const create = createPlugin;
    export const combine = combinePlugins;
    export type ToDatabase<P extends Database.Plugin> = Database.FromPlugin<P>;
    export type ToStore<P extends Database.Plugin> = Store<FromSchemas<P['components']>, FromSchemas<P['resources']>, P['archetypes']>;
    export type ToSystemDatabase<P extends Database.Plugin> = Database.FromPlugin<P> & { readonly store: Database.Plugin.ToStore<P> };
  }

}
