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

import { FromSchemas } from "../../../schema/from-schemas.js";
import { StringKeyof } from "../../../types/types.js";
import { ComponentSchemas } from "../../component-schemas.js";
import { Store } from "../../index.js";
import { ResourceSchemas } from "../../resource-schemas.js";
import { ArchetypeComponents } from "../../store/archetype-components.js";
import { Database } from "../database.js";
import type { TransactionDeclarations } from "../../store/transaction-functions.js";
import { DatabaseFromSchema, DatabaseSchema } from "./database-schema.js";

export function createDatabaseSchema<
    const CS extends ComponentSchemas,
    const RS extends ResourceSchemas,
    const A extends ArchetypeComponents<StringKeyof<CS>>,
    const TD extends TransactionDeclarations<FromSchemas<CS>, FromSchemas<RS>, A>
>(
    components: CS,
    resources: RS,
    archetypes: A,
    transactions: TD,
) {
    return { components, resources, archetypes, transactions } as const satisfies DatabaseSchema<CS, RS, A, TD>;
}

export function createDatabaseFromSchema<
    const CS extends ComponentSchemas,
    const RS extends ResourceSchemas,
    const A extends ArchetypeComponents<StringKeyof<CS>>,
    const TD extends TransactionDeclarations<FromSchemas<CS>, FromSchemas<RS>, A>
>(
    schema: DatabaseSchema<CS, RS, A, TD>,
): DatabaseFromSchema<typeof schema> {
    return Database.create(
        Store.create<CS, RS, A>({
            components: schema.components,
            resources: schema.resources,
            archetypes: schema.archetypes,
        }),
        schema.transactions as any
    ) as any;
}
