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

import { FromSchemas } from "@adobe/data/schema";
import { Database, ToTransactionFunctions, TransactionDeclaration } from "../database.js";
import { ComponentSchemas } from "../../component-schemas.js";
import { ResourceSchemas } from "../../resource-schemas.js";
import { Store } from "../../store/store.js";
import { ArchetypeComponents } from "../../store/archetype-components.js";
import { StringKeyof } from "../../../types/types.js";

export type DatabaseSchema<
    CS extends ComponentSchemas,
    RS extends ResourceSchemas,
    A extends ArchetypeComponents<StringKeyof<CS>>,
    TD extends Record<string, TransactionDeclaration<FromSchemas<CS>, FromSchemas<RS>, A>>
> = {
    readonly components: CS;
    readonly resources: RS;
    readonly archetypes: A;
    readonly transactions: (store: Store<FromSchemas<CS>, FromSchemas<RS>, A>) => TD;
};

export type DatabaseFromSchema<T> = T extends DatabaseSchema<infer CS, infer RS, infer A, infer TD> ? Database<FromSchemas<CS>, FromSchemas<RS>, A, ToTransactionFunctions<TD>> : never;

export type StoreFromSchema<T> = T extends DatabaseSchema<infer CS, infer RS, infer A, infer TD> ? Store<FromSchemas<CS>, FromSchemas<RS>, A> : never;
