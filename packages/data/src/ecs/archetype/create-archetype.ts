// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "../../schema/index.js";
import * as TABLE from "../../table/index.js";
import { Archetype } from "./archetype.js";
import { RequiredComponents } from "../required-components.js";
import { EntityLocationTable } from "../entity-location-table/entity-location-table.js";
import { Entity } from "../entity.js";
import { StringKeyof } from "../../types/types.js";

export const createArchetype = <C extends { id: typeof Entity.schema }>(
    components: C,
    id: number,
    entityLocationTable: EntityLocationTable,
): Archetype<RequiredComponents & { [K in keyof C]: Schema.ToType<C[K]> }> => {
    const table = TABLE.createTable(components);
    const createEntity = (rowData: Omit<{ [K in keyof C]: Schema.ToType<C[K]> }, "id">): Entity => {
        // add the row (excluding entity id)
        const row = TABLE.addRow(archetype as any, rowData);
        // create the entity lookup record
        const entity = entityLocationTable.create({ archetype: archetype.id, row });
        // set the entity id for the row (since it wasn't present in the row data)
        archetype.columns.id.set(row, entity as any);
        return entity;
    }

    const componentSet = new Set(Object.keys(components));

    const archetype = {
        id,
        ...table,
        components: componentSet as Set<StringKeyof<C>>,
        insert: createEntity,
        toData: () => ({
            columns: archetype.columns,
            rowCount: archetype.rowCount,
            rowCapacity: archetype.rowCapacity,
        }),
        fromData: (data: unknown) => {
            Object.assign(archetype, data);
            // component set cannot be changed by this as the archetype components should be the same.
        }
    } as const satisfies Archetype<{ [K in keyof C]: Schema.ToType<C[K]> }> as Archetype<RequiredComponents & { [K in keyof C]: Schema.ToType<C[K]> }>;
    return archetype;
}