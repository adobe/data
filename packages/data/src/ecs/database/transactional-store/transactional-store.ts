// © 2026 Adobe. MIT License. See /LICENSE for details.

import { ArchetypeId, EntityInsertValues } from "../../archetype/index.js";
import { ResourceComponents } from "../../store/resource-components.js";
import { ReadonlyStore, Store } from "../../store/index.js";
import { Entity } from "../../entity/entity.js";
import { EntityUpdateValues } from "../../store/core/index.js";
import { Components } from "../../store/components.js";
import { StringKeyof } from "../../../types/types.js";
import { ArchetypeComponents } from "../../store/archetype-components.js";
import { FromSchemas } from "../../../schema/from-schemas.js";
import { Undoable } from "../undoable.js";
import { IndexDeclarations } from "../../store/index-types.js";
import { PartitionKeysOf } from "../../store/partition.js";
import { createTransactionalStore } from "./create-transactional-store.js";

export interface TransactionalStore<
    C extends Components = never,
    R extends ResourceComponents = never,
    A extends ArchetypeComponents<StringKeyof<C>> = never,
    IX extends IndexDeclarations<C> = {},
    PK extends string = never,
> extends ReadonlyStore<C, R, A, IX, PK> {
    /**
     * Execute a transaction on the store.
     * The transactionFunction must NOT directly mutate archetype rows as those changes would not be captured.
     * Instead, use the store's update and delete and archetype insert methods to make changes.
     * @param transactionFunction - A function that takes the store as an argument and performs some operations on it.
     * @returns A promise that resolves when the transaction is complete.
     */
    execute(
        transactionFunction: (t: Store<C, R, A, IX, PK>) => Entity | void,
        options?: {
            intermediate?: boolean;
            userId?: number | string;
        }
    ): TransactionResult<C>;

    extend<S extends Store.Schema<any, any, any>>(
        schema: S,
    ): TransactionalStore<
        C & (S extends Store.Schema<infer XC, any, any> ? FromSchemas<XC> : never),
        R & (S extends Store.Schema<any, infer XR, any> ? FromSchemas<XR> : never),
        A & (S extends Store.Schema<any, any, infer XA> ? XA : never),
        IX,
        PK | (S extends Store.Schema<infer XC, any, any> ? PartitionKeysOf<XC> : never)
    >;

    transactionStore: Store<C, R, A, IX, PK>;

    /** See {@link Store.pruneToSchema}. Also syncs the transactional resource wrapper. */
    pruneToSchema(keep: ReadonlySet<string>): void;
}

export type TransactionInsertOperation<C> = {
    type: "insert";
    values: EntityInsertValues<C>;
};

export type TransactionUpdateOperation<C> = {
    type: "update";
    entity: Entity;
    values: EntityUpdateValues<C>;
};

export type TransactionDeleteOperation = {
    type: "delete";
    entity: Entity
};

export type TransactionWriteOperation<C> =
    | TransactionInsertOperation<C>
    | TransactionUpdateOperation<C>
    | TransactionDeleteOperation;

export interface TransactionResult<C = unknown> {
    /**
     * The Entity value if any returned by the transaction function.
     */
    readonly value: Entity | void;
    /** True when the transaction is a non-final intermediate operation within a sequence. */
    readonly intermediate: boolean;
    /** True when at least one changed entity is persistent (see Entity.isPersistent). */
    readonly persistent: boolean;
    readonly undoable: null | Undoable;
    readonly redo: TransactionWriteOperation<C>[];
    readonly undo: TransactionWriteOperation<C>[];
    readonly changedEntities: Map<Entity, EntityUpdateValues<C> | null>;
    /**
     * Entities relocated to a new backing row as a SIDE EFFECT of this
     * transaction — swap-moved neighbors of a delete/migration, plus the
     * migrated entity itself. Distinct from `changedEntities` (the directly
     * touched entities): a relocated entity's columns are freshly established
     * at its new row and are NOT covered by `changedEntities`, so a consumer
     * that mirrors row layout (e.g. persistence) must full-write it. Empty for
     * transactions with no swap/migration.
     */
    readonly relocatedEntities: Set<Entity>;
    // Component names are always strings. Keeping this `Set<string>` (rather
    // than `Set<keyof C | string>`) avoids widening to `string | number |
    // symbol` for a generic `C`, which otherwise makes `TransactionResult<C>`
    // fail to satisfy the type-erased `TransactionResult<unknown>` boundary the
    // concurrency strategy / reconciler is written against.
    readonly changedComponents: Set<string>;
    readonly changedArchetypes: Set<ArchetypeId>;
}

export namespace TransactionResult {
    /**
     * Run `fn` against `store` as a single recorded transaction: `store` is
     * mutated in place, and the resulting change-set is returned as a
     * {@link TransactionResult}.
     *
     * The returned result is a **replicable delta**: its `redo` operations can be
     * forwarded to a peer and replayed there with `applyOperations`, so a
     * pluggable replication strategy can propagate an *out-of-transaction* store
     * edit — e.g. a version-upgrade migration run inside a load handler — through
     * whatever transport it chooses. Core stays propagation-agnostic; this only
     * captures.
     *
     * The transactional wrapper is created and discarded internally, so this is
     * the "wrap the store, do the work as one transaction, keep the change, throw
     * the wrapper away" pattern in a single call. Ops inside `fn` must go through
     * the provided `t` (not the outer `store`) to be recorded.
     */
    export const capture = <
        C extends Components,
        R extends ResourceComponents,
        A extends ArchetypeComponents<StringKeyof<C>> = never,
    >(
        store: Store<C, R, A>,
        fn: (t: Store<C, R, A>) => void,
    ): TransactionResult<C> => createTransactionalStore(store).execute(fn);
}
