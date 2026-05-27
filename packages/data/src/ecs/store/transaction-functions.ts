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

/**
 * Extracts the `AsyncArgsProvider`-arg overload from a `ToTransactionFunctions`
 * entry as a single-signature function. TypeScript's structural assignment and
 * `Parameters` / `ReturnType` see only the *last* overload of an overloaded
 * function type, which hides the async-provider overload when a transaction is
 * passed by value (e.g. as a prop). This helper recovers the async-provider
 * signature without forcing consumers to copy/paste the Input shape.
 */
export type ToAsyncTransactionFn<T> = T extends {
    (arg: AsyncArgsProvider<infer Input>): Promise<infer R>;
    (arg: any): any;
}
    ? (arg: AsyncArgsProvider<Input>) => Promise<R>
    : never;

/**
 * Extracts the plain-arg (synchronous) overload from a `ToTransactionFunctions`
 * entry as a single-signature function. Pairs with `ToAsyncTransactionFn`
 * for consumers that need to type each call path independently.
 */
export type ToSyncTransactionFn<T> = T extends {
    (arg: AsyncArgsProvider<any>): any;
    (arg: infer Input): infer R;
}
    ? (arg: Input) => R
    : never;
