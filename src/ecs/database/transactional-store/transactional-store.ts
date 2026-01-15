// © 2026 Adobe. MIT License. See /LICENSE for details.

import { ArchetypeId, EntityInsertValues } from "../../archetype/index.js";
import { ResourceComponents } from "../../store/resource-components.js";
import { ReadonlyStore, Store } from "../../store/index.js";
import { Entity } from "../../entity.js";
import { EntityUpdateValues } from "../../store/core/index.js";
import { Components } from "../../store/components.js";
import { StringKeyof } from "../../../types/types.js";
import { ArchetypeComponents } from "../../store/archetype-components.js";
import { FromSchemas } from "../../../schema/from-schemas.js";
import { Undoable } from "../undoable.js";

export interface TransactionalStore<
    C extends Components = never,
    R extends ResourceComponents = never,
    A extends ArchetypeComponents<StringKeyof<C>> = never,
> extends ReadonlyStore<C, R, A> {
    /**
     * Execute a transaction on the store.
     * The transactionFunction must NOT directly mutate archetype rows as those changes would not be captured.
     * Instead, use the store's update and delete and archetype insert methods to make changes.
     * @param transactionFunction - A function that takes the store as an argument and performs some operations on it.
     * @returns A promise that resolves when the transaction is complete.
     */
    execute(
        transactionFunction: (t: Store<C, R, A>) => Entity | void,
        options?: {
            transient?: boolean;
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
    readonly transient: boolean;
    readonly undoable: null | Undoable;
    readonly redo: TransactionWriteOperation<C>[];
    readonly undo: TransactionWriteOperation<C>[];
    readonly changedEntities: Map<Entity, EntityUpdateValues<C> | null>;
    readonly changedComponents: Set<keyof C | string>;
    readonly changedArchetypes: Set<ArchetypeId>;
}
