// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Database } from "../database/database.js";
import { Components } from "./components.js";
import { ResourceComponents } from "./resource-components.js";
import { ArchetypeComponents } from "./archetype-components.js";
import { StringKeyof } from "../../types/types.js";
import type { TransactionFunctions } from "./transaction-functions.js";

export type ActionDeclaration<
    C extends Components,
    R extends ResourceComponents,
    A extends ArchetypeComponents<StringKeyof<C>>,
    F extends TransactionFunctions,
    S extends string,
    Input extends any | void = any> = (db: Database<C, R, A, F, S>, input: Input) => any;

export type ActionDeclarations<
    C extends Components,
    R extends ResourceComponents,
    A extends ArchetypeComponents<StringKeyof<C>>,
    F extends TransactionFunctions,
    S extends string> = { readonly [Q: string]: ActionDeclaration<C, R, A, F, S> };

/**
 * Converts from ActionDeclarations to ActionFunctions by removing the initial Database argument.
 */
export type ToActionFunctions<T> = {
    [K in keyof T]:
    T[K] extends (db: infer D) => infer R
    ? () => R
    : T[K] extends (db: infer D, input: infer Input) => infer R
    ? (arg: Input) => R
    : never;
};

export type ActionFunction = (args?: any) => any;
export type ActionFunctions = { readonly [AF: string]: ActionFunction };

