// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "../../schema/index.js";
import * as TABLE from "../../table/index.js";
import { Archetype } from "./archetype.js";
import { RequiredComponents } from "../required-components.js";
import { EntityLocationTable } from "../entity-location-table/entity-location-table.js";
import { Entity } from "../entity/entity.js";
import { StringKeyof } from "../../types/types.js";
import { ensureCapacity } from "../../table/ensure-capacity.js";
import { TypedBuffer } from "../../typed-buffer/index.js";

// Code-generate a specialized insert function per archetype so the per-row
// hot path is straight-line — no `for...in`, no `cols[name]` polymorphic
// lookups, no captured-via-closure column references. CPU profiling showed
// the previous closure (addRow + entityLocationTable.create({...}) +
// columns.id.set chain) at >50% of CPU on tight insert loops; the
// specialized form gives V8 fully inlinable code.
//
// Reads `archetype.columns` / `archetype.rowCount` dynamically on every
// call so `fromData()` (which Object.assigns over the archetype) doesn't
// leave the insert path holding stale references.
//
// Identifier validation: a malformed component name could escape the
// generated code into a syntax/code-injection problem. We restrict to a
// safe identifier shape and fall back to the generic path if any name
// fails the check.
const SAFE_IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

type InsertImpl = (
    archetype: { columns: Record<string, TypedBuffer<any>>; rowCount: number; rowCapacity: number },
    rowData: any,
    entityLocationTable: EntityLocationTable,
    archetypeId: number,
    ensureCapacityFn: typeof ensureCapacity,
) => Entity;

const buildSpecializedInsert = (componentNames: readonly string[]): InsertImpl | null => {
    if (componentNames.some((n) => !SAFE_IDENT.test(n))) {
        return null;
    }
    const sets = componentNames
        .filter((n) => n !== "id")
        .map((n) => `        cols.${n}.set(row, rowData.${n});`)
        .join("\n");
    const body = `
        if (archetype.rowCapacity <= archetype.rowCount) {
            ensureCapacityFn(archetype, archetype.rowCount + 1);
        }
        const row = archetype.rowCount;
        const cols = archetype.columns;
${sets}
        const entity = entityLocationTable.create({ archetype: archetypeId, row });
        cols.id.set(row, entity);
        archetype.rowCount = row + 1;
        return entity;
    `;
    // eslint-disable-next-line no-new-func
    return new Function(
        "archetype", "rowData", "entityLocationTable", "archetypeId", "ensureCapacityFn",
        body,
    ) as InsertImpl;
};

const genericInsert: InsertImpl = (archetype, rowData, entityLocationTable, archetypeId) => {
    const row = TABLE.addRow(archetype as any, rowData);
    const entity = entityLocationTable.create({ archetype: archetypeId, row });
    archetype.columns.id.set(row, entity);
    return entity;
};

export const createArchetype = <C extends { id: typeof Entity.schema }>(
    components: C,
    id: number,
    entityLocationTable: EntityLocationTable,
): Archetype<RequiredComponents & { [K in keyof C]: Schema.ToType<C[K]> }> => {
    const table = TABLE.createTable(components);
    const componentNames = Object.keys(components);
    const componentSet = new Set(componentNames);
    const insertImpl = buildSpecializedInsert(componentNames) ?? genericInsert;

    const createEntity = (rowData: Omit<{ [K in keyof C]: Schema.ToType<C[K]> }, "id">): Entity => {
        return insertImpl(archetype as any, rowData, entityLocationTable, id, ensureCapacity);
    };

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