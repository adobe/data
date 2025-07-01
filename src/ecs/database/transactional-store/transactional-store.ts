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
import { ArchetypeId, EntityInsertValues } from "../../archetype/index.js";
import { ResourceComponents } from "../../store/resource-components.js";
import { ReadonlyStore, Store } from "../../store/index.js";
import { Entity } from "../../entity.js";
import { EntityUpdateValues } from "../../store/core/index.js";
import { Components } from "../../store/components.js";
import { StringKeyof } from "../../../types/types.js";
import { ArchetypeComponents } from "../../store/archetype-components.js";

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
        transactionFunction: (store: Store<C, R, A>) => Entity | void,
        options?: {
            transient?: boolean;
        }
    ): TransactionResult<C>;

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

export interface TransactionResult<C> {
    /**
     * The Entity value if any returned by the transaction function.
     */
    readonly value: Entity | void;
    readonly transient: boolean;
    readonly redo: TransactionWriteOperation<C>[];
    readonly undo: TransactionWriteOperation<C>[];
    readonly changedEntities: Set<Entity>;
    readonly changedComponents: Set<keyof C>;
    readonly changedArchetypes: Set<ArchetypeId>;
}
