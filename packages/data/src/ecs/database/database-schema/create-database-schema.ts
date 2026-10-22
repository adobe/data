// © 2026 Adobe. MIT License. See /LICENSE for details.

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
        Database.Plugin.create({
            // Widened to the constraints: a generic `CS` can't be proven free of
            // reserved names at compile time; the store still rejects them at runtime.
            components: schema.components as ComponentSchemas,
            resources: schema.resources as ResourceSchemas,
            archetypes: schema.archetypes as any,
            transactions: schema.transactions as any,
        })
    ) as any;
}
