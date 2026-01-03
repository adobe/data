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

