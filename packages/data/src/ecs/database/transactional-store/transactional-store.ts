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

/**
 * The first argument passed to every transaction function. Extends the full
 * store read/write surface with `userId` — the identifier of the peer or user
 * that initiated the transaction. Transaction functions can use this to
 * enforce per-user authorization rules (e.g. a game that lets only the
 * current player move).
 *
 * `userId` is `undefined` in local-only (no-sync) databases.
 */
export type TransactionContext<
    C extends Components,
    R extends ResourceComponents,
    A extends ArchetypeComponents<StringKeyof<C>>,
    IX extends IndexDeclarations<C> = {},
> = Store<C, R, A, IX> & {
    readonly userId: number | string | undefined;
};

export interface TransactionalStore<
    C extends Components = never,
    R extends ResourceComponents = never,
    A extends ArchetypeComponents<StringKeyof<C>> = never,
    IX extends IndexDeclarations<C> = {},
> extends ReadonlyStore<C, R, A, IX> {
    /**
     * Execute a transaction on the store.
     * The transactionFunction must NOT directly mutate archetype rows as those changes would not be captured.
     * Instead, use the store's update and delete and archetype insert methods to make changes.
     * @param transactionFunction - A function that takes the store as an argument and performs some operations on it.
     * @returns A promise that resolves when the transaction is complete.
     */
    execute(
        transactionFunction: (t: TransactionContext<C, R, A>) => Entity | void,
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
        A & (S extends Store.Schema<any, any, infer XA> ? XA : never)
    >;

    transactionStore: Store<C, R, A>;
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
    /** True when at least one changed entity is persistent (entity id >= 0). */
    readonly persistent: boolean;
    readonly undoable: null | Undoable;
    readonly redo: TransactionWriteOperation<C>[];
    readonly undo: TransactionWriteOperation<C>[];
    readonly changedEntities: Map<Entity, EntityUpdateValues<C> | null>;
    // Component names are always strings. Keeping this `Set<string>` (rather
    // than `Set<keyof C | string>`) avoids widening to `string | number |
    // symbol` for a generic `C`, which otherwise makes `TransactionResult<C>`
    // fail to satisfy the type-erased `TransactionResult<unknown>` boundary the
    // concurrency strategy / reconciler is written against.
    readonly changedComponents: Set<string>;
    readonly changedArchetypes: Set<ArchetypeId>;
}
