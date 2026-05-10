// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Store } from "./store.js";
import { Entity } from "../entity/entity.js";
import { Components } from "./components.js";
import { ResourceComponents } from "./resource-components.js";
import { ArchetypeComponents } from "./archetype-components.js";
import { StringKeyof } from "../../types/types.js";
import type { TransactionContext } from "../database/transactional-store/transactional-store.js";

export type TransactionDeclaration<
    C extends Components,
    R extends ResourceComponents,
    A extends ArchetypeComponents<StringKeyof<C>>,
    Input extends any | void = any> = (t: TransactionContext<C, R, A>, input: Input) => void | Entity;

export type AsyncArgsProvider<T> = () => Promise<T> | AsyncGenerator<T>;

export type TransactionDeclarations<
    C extends Components,
    R extends ResourceComponents,
    A extends ArchetypeComponents<StringKeyof<C>>> = { readonly [Q: string]: TransactionDeclaration<C, R, A> };

/**
 * Converts from TransactionDeclarations to TransactionFunctions by removing
 * the initial store argument.
 *
 * Each transaction is exposed as an overloaded function: passing a plain
 * `Input` synchronously returns the transaction's `R` (`void | Entity`);
 * passing an `AsyncArgsProvider<Input>` (a function returning a `Promise`
 * or `AsyncGenerator`) defers the commit until the source resolves and
 * returns `Promise<R>`. This matches the runtime behaviour of the
 * dispatcher in `create-transaction-dispatcher.ts`.
 */
export type ToTransactionFunctions<T> = {
    [K in keyof T]:
    T[K] extends (t: infer S) => infer R
    ? R extends void | Entity
    ? () => R
    : never
    : T[K] extends (t: infer S, input: infer Input) => infer R
    ? R extends void | Entity
    ? {
        // AsyncArgsProvider overload listed first so it is selected when the
        // call site passes a function returning a Promise / AsyncGenerator;
        // ordering matters when Input is itself a function-shaped type.
        (arg: AsyncArgsProvider<Input>): Promise<R>;
        (arg: Input): R;
    }
    : never
    : never;
};

export type TransactionFunction = (args?: any) => void | Entity;
export type TransactionFunctions = { readonly [AF: string]: TransactionFunction };
