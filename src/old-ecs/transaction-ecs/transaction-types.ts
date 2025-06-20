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
import { Data } from "../../index.js";
import { Observe } from "../../observe/types.js";
import { FromSchema, Schema } from "../../schema/schema.js";
import { Simplify } from "../../types/types.js";
import {
  EntityCreateValues,
  Entity,
  EntityValues,
  EntityUpdateValues,
  CoreComponents,
} from "../core-ecs/core-ecs-types.js";
import {
  Archetable,
  ECS,
  ECSArchetypes,
  ECSComponents,
  ECSResources,
  ECSWrite,
  SelectOptions,
} from "../ecs/ecs-types.js";

export interface TransactionECS<
  C extends ECSComponents, //  name => Component Value Type
  A extends ECSArchetypes, //  name => Entity Values Type
  R extends ECSResources, //  name => Resource Value Type
> extends Pick<
  ECS<C, A, R>,
  | "components"
  | "archetypes"
  | "getComponentValue"
  | "getArchetype"
  | "getEntityValues"
  | "countEntities"
  | "selectEntities"
  | "selectEntityValues"
  | "toJSON"
>,
  TransactionProvider<C, A, R> {
  resources: { +readonly [K in keyof R]: R[K] };

  withComponents<
    S extends { [K: string]: Schema },
    T = { -readonly [K in keyof S]: FromSchema<S[K]> },
  >(
    components: S
  ): TransactionECS<Simplify<C & T>, A, R>;
  withArchetypes<S extends { [K: string]: ReadonlyArray<keyof C> }>(
    archetypes: S
  ): TransactionECS<
    C,
    Simplify<A & { [AN in keyof S]: Archetable<{ [PN in S[AN][number]]: C[PN] }> }>,
    R
  >;
  withResources<S extends { [K: string]: Data }>(
    resources: S
  ): TransactionECS<C, A, Simplify<R & S>>;

  observe: TransactionObservables<C, A, R>;
}

export interface TransactionObservables<
  C extends ECSComponents = any, //  name => Component Value Type
  A extends ECSArchetypes = any, //  name => Entity Values Type
  R extends ECSResources = any, //  name => Resource Value Type
> {
  transactions: Observe<TransactionCommit<C>>;
  resource: {
    // function call resource (legacy)
    <K extends keyof R>(key: K): Observe<R[K]>;
  } & {
    // property access resource (new)
    [K in keyof R]: Observe<R[K]>;
  };

  entityValues<A extends Archetable>(
    id: Entity,
    archetype: A & Partial<EntityValues<C>>
  ): Observe<EntityValuesFor<A> | null | undefined>;
  entityValues(id: Entity): Observe<EntityValues<C> | undefined>;

  entityChanges(entity: Entity): Observe<void>;
  componentChanges<K extends keyof C>(component: K): Observe<void>;
  archetypeChanges<A extends CoreComponents>(
    archetype: Archetable<A>
  ): Observe<void>;

  archetypeEntities<A extends CoreComponents>(
    archetype: Archetable<A>,
    options?: Omit<SelectOptions<C, A>, "components">
  ): Observe<Entity[]>;
}

/**
 * Options when creating an ECSTransaction.
 */
export interface TransactionOptions {
  /**
   * Will this transaction be added to the undo stack?
   * Defaults to true.
   */
  undoable?: boolean;
  /**
   * When was this transactions created in UTC time.
   */
  createdTime?: number;
  /**
   * The unique identifier for the user creating the transaction.
   */
  createdBy?: string;
}

interface TransactionProvider<
  C extends ECSComponents, //  name => Component Value Type
  A extends ECSArchetypes, //  name => Entity Values Type
  R extends ECSResources, //  name => Resource Value Type
> {
  createTransaction(options?: TransactionOptions): Transaction<C, A, R>;
}

/**
 * Type alias for a CreateOperation in the ECS (Entity Component System).
 * Represents an operation to create a new entity with the specified components.
 * @template C - Components used by the entity.
 */
export type TransactionCreateOperation<C> = {
  type: "create";
  values: EntityCreateValues<C>;
};

/**
 * Type alias for an UpdateOperation in the ECS (Entity Component System).
 * Represents an operation to update an existing entity with the specified components.
 * @template C - Components used by the entity.
 */
export type TransactionUpdateOperation<C> = {
  type: "update";
  entity: Entity;
  values: EntityUpdateValues<C>;
};

/**
 * Type alias for a DeleteOperation in the ECS (Entity Component System).
 * Represents an operation to delete an existing entity.
 */
export type TransactionDeleteOperation = { type: "delete"; entity: Entity };

/**
 * Type alias for a WriteOperation in the ECS (Entity Component System).
 * Represents an operation to create, update, or delete an entity.
 * @template C - Components used by the entity.
 */
export type TransactionWriteOperation<C> =
  | TransactionCreateOperation<C>
  | TransactionUpdateOperation<C>
  | TransactionDeleteOperation;

/**
 * Represents a completed transaction in the ECS, which can either be a commit or a cancel.
 * @template C - Components used in the transaction.
 */
export type TransactionComplete<C> = TransactionCommit<C> | TransactionCancel;

/**
 * Represents a committed transaction in the ECS.
 * @template C - Components used in the transaction.
 */
export interface TransactionCommit<C> {
  committed: true; // Indicates that the transaction has been committed
  options: TransactionOptions; // Options for the transaction
  redoOperations: TransactionWriteOperation<C>[]; // Operations to redo the transaction
  undoOperations: TransactionWriteOperation<C>[]; // Operations to undo the transaction
}

/**
 * Represents a cancelled transaction in the ECS.
 */
export interface TransactionCancel {
  committed: false; // Indicates that the transaction has been cancelled
  options: TransactionOptions; // Options for the transaction
}

export interface Transaction<
  C extends ECSComponents, //  name => Component Value Type
  A extends ECSArchetypes, //  name => Entity Values Type
  R extends ECSResources, //  name => Resource Value Type
> extends TransactionProvider<C, A, R>,
  ECSWrite<C> {
  readonly ecs: TransactionECS<C, A, R>;
  readonly options: Required<TransactionOptions>;
  readonly resources: { -readonly [K in keyof R]: R[K] };
  batch(operations: TransactionWriteOperation<C>[]): this;
  commit(): TransactionCommit<C>;
  cancel(): TransactionCancel;
}

/**
 * @internal
 */
export interface TransactionChanges<C extends ECSComponents> {
  readonly entities: Set<Entity>;
  readonly components: Set<keyof C>;
  readonly archetypes: Set<Archetable>;
}

/**
 * @internal
 */
export type TransactionCommitFor<ECS> =
  ECS extends TransactionECS<infer C, infer A, infer R>
  ? TransactionCommit<C>
  : never;
/**
 * @internal
 */
export type TransactionFor<ECS> =
  ECS extends TransactionECS<infer C, infer A, infer R>
  ? Transaction<C, A, R>
  : never;
/**
 * @internal
 */
export type EntityValuesFor<T> =
  T extends TransactionECS<infer C, infer A, infer R>
  ? EntityValues<C>
  : T extends Archetable<infer E>
  ? E
  : never;
