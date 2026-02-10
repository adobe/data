// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Store } from "./store.js";
import { Entity } from "../entity.js";
import { Components } from "./components.js";
import { ResourceComponents } from "./resource-components.js";
import { ArchetypeComponents } from "./archetype-components.js";
import { StringKeyof } from "../../types/types.js";

export type TransactionDeclaration<
    C extends Components,
    R extends ResourceComponents,
    A extends ArchetypeComponents<StringKeyof<C>>,
    Input extends any | void = any> = (t: Store<C, R, A>, input: Input) => void | Entity;

export type AsyncArgsProvider<T> = () => Promise<T> | AsyncGenerator<T>;

export type TransactionDeclarations<
    C extends Components,
    R extends ResourceComponents,
    A extends ArchetypeComponents<StringKeyof<C>>> = { readonly [Q: string]: TransactionDeclaration<C, R, A> };

/**
 * Converts from TransactionDeclarations to TransactionFunctions by removing the initial store argument.
 */
export type ToTransactionFunctions<T> = {
    [K in keyof T]:
    T[K] extends (t: infer S) => infer R
    ? R extends void | Entity
    ? () => R
    : never
    : T[K] extends (t: infer S, input: infer Input) => infer R
    ? R extends void | Entity
    ? (arg: Input | AsyncArgsProvider<Input>) => R
    : never
    : never;
};

export type TransactionFunction = (args?: any) => void | Entity;
export type TransactionFunctions = { readonly [AF: string]: TransactionFunction };
