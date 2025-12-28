import type { Store } from "./store.js";
import { Entity } from "../entity.js";
import { Components } from "./components.js";
import { ResourceComponents } from "./resource-components.js";
import { ArchetypeComponents } from "./archetype-components.js";
import { StringKeyof } from "../../types/types.js";

export type ActionDeclaration<
    C extends Components,
    R extends ResourceComponents,
    A extends ArchetypeComponents<StringKeyof<C>>,
    Input extends any | void = any> = (t: Store<C, R, A>, input: Input) => void | Entity;

export type AsyncArgsProvider<T> = () => Promise<T> | AsyncGenerator<T>;

export type ActionDeclarations<
    C extends Components,
    R extends ResourceComponents,
    A extends ArchetypeComponents<StringKeyof<C>>> = { readonly [Q: string]: ActionDeclaration<C, R, A> };

/**
 * Converts from TransactionDeclarations to TransactionFunctions by removing the initial store argument.
 */
export type ToActionFunctions<T> = {
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

export type ActionFunction = (args?: any) => void | Entity;
export type ActionFunctions = { readonly [AF: string]: ActionFunction };
