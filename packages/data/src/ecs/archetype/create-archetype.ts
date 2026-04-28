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

// ───────────────────────────────────────────────────────────────────────────
// Specialized insert function per archetype.
//
// Why: archetype.insert(rowData) is the hottest write path in the ECS. CPU
//      profiling showed the previous implementation spending ~30 % self-time
//      in the createEntity closure body and another ~10 % in addRow's
//      `for (name in rowData)` loop, on what is logically a sequence of
//      typed-array stores. V8 wasn't inlining because:
//
//        (a) addRow iterated `rowData` keys with `for...in`, then did a
//            polymorphic `cols[name]` lookup per field;
//        (b) the column reference chain `archetype.columns.id.set(...)` was
//            three property loads + a method call, all on closure-captured
//            `archetype`;
//        (c) entityLocationTable.create(...) took an `{ archetype, row }`
//            object literal, allocated fresh per insert.
//
// What we do instead:
//      1. At archetype-creation time, build the per-component column refs
//         once and bake them into a code-generated insert function as
//         closure constants. The hot path then reads `_color.set(row, …)`
//         where `_color` is a const slot the JIT can fold and inline —
//         identical machine code to a hand-written straight-line insert.
//      2. The generated body unrolls every column.set call — no `for...in`,
//         no string-keyed lookup, one inlinable typed-array store per
//         component.
//      3. archetype.rowCount / rowCapacity stay dynamic (we read them off
//         the archetype every call) because they DO change every insert and
//         on grow. The COLUMN REFERENCES are baked because they don't —
//         createTable allocates the column objects once and we never swap
//         them. (TypedBuffer's internal `array` field can grow, but the
//         column object itself is stable.)
//      4. fromData() Object.assigns over rowCount / rowCapacity / columns
//         when restoring from serialized data. That replaces archetype.columns
//         with the deserialized columns, invalidating the baked refs. We
//         rebuild insertImpl in fromData so the baked refs are always
//         current. In the steady-state hot path (no fromData), the rebuild
//         never runs and the baked refs persist for the archetype's life.
//      5. SAFE_IDENT gates the codegen: a malformed component name could
//         escape the template into syntax-error or code-injection territory,
//         so any non-identifier name falls back to the generic for-in path.
// ───────────────────────────────────────────────────────────────────────────
const SAFE_IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

// The insert function takes `archetype` as a parameter so its `rowCount` /
// `rowCapacity` (which mutate every insert / on grow) are read off the live
// archetype each call. The column references themselves are baked at
// archetype-creation time as closure constants — those never change in
// normal operation, so paying the property-chain lookup per insert would
// be pure waste.
type InsertImpl = (
    archetype: { rowCount: number; rowCapacity: number },
    rowData: any,
) => Entity;

const buildSpecializedInsert = (
    archetypeId: number,
    columns: Record<string, TypedBuffer<any>>,
    entityLocationTable: EntityLocationTable,
): InsertImpl | null => {
    const componentNames = Object.keys(columns);
    if (componentNames.some((n) => !SAFE_IDENT.test(n))) {
        return null;
    }

    // Build two parallel lists in matching order:
    //   componentParamNames:   parameter names of the *factory* function
    //                          we generate via `new Function`. Each becomes
    //                          a local in the factory; the inner `insert`
    //                          it returns sees them as fast closure
    //                          constants — V8 treats these like
    //                          const-folded values rather than property
    //                          loads.
    //   componentParamValues:  the actual column refs to hand the factory
    //                          when we invoke it once per archetype.
    // For non-id columns we prefix the local with `_` to avoid colliding
    // with reserved words or shadowing globals (e.g. a component called
    // `delete`).
    const componentParamNames: string[] = [];
    const componentParamValues: TypedBuffer<any>[] = [];
    const sets: string[] = [];
    for (const name of componentNames) {
        if (name === "id") continue;
        const local = `_${name}`;
        componentParamNames.push(local);
        componentParamValues.push(columns[name]);
        sets.push(`        ${local}.set(row, rowData.${name});`);
    }

    const factoryBody = `
        // archetypeId, ensureCapacityFn, entityLocationTable, _id, and one
        // _<name> per non-id component are captured here as closure
        // constants. The returned insert function dereferences them as fast
        // local context slots — no property chain on the hot path.
        return function insert(archetype, rowData) {
            // archetype.rowCount / rowCapacity *must* be read from the live
            // archetype every call — both mutate on the hot path (rowCount
            // every insert; rowCapacity on grow).
            if (archetype.rowCapacity <= archetype.rowCount) {
                ensureCapacityFn(archetype, archetype.rowCount + 1);
            }
            const row = archetype.rowCount;
${sets.join("\n")}
            // entityLocationTable.create takes an object today — the alloc
            // is small and V8's escape analysis usually scalar-replaces it.
            // If that ever surfaces in a future profile, change the
            // EntityLocationTable.create signature to (archetypeId, row).
            const entity = entityLocationTable.create({ archetype: archetypeId, row });
            _id.set(row, entity);
            archetype.rowCount = row + 1;
            return entity;
        };
    `;
    // eslint-disable-next-line no-new-func
    const factory = new Function(
        "archetypeId",
        "ensureCapacityFn",
        "entityLocationTable",
        "_id",
        ...componentParamNames,
        factoryBody,
    ) as (
        archetypeId: number,
        ensureCapacityFn: typeof ensureCapacity,
        entityLocationTable: EntityLocationTable,
        idColumn: TypedBuffer<number>,
        ...componentColumns: TypedBuffer<any>[]
    ) => InsertImpl;

    return factory(
        archetypeId,
        ensureCapacity,
        entityLocationTable,
        columns.id as TypedBuffer<number>,
        ...componentParamValues,
    );
};

// Generic fallback for archetypes whose component names contain
// non-identifier characters (so we can't safely embed them into generated
// code). Same logic, just done via property-keyed access on the live
// archetype.
const buildGenericInsert = (
    archetypeId: number,
    entityLocationTable: EntityLocationTable,
): InsertImpl => {
    return (archetype: any, rowData: any) => {
        const row = TABLE.addRow(archetype, rowData);
        const entity = entityLocationTable.create({ archetype: archetypeId, row });
        archetype.columns.id.set(row, entity);
        return entity;
    };
};

export const createArchetype = <C extends { id: typeof Entity.schema }>(
    components: C,
    id: number,
    entityLocationTable: EntityLocationTable,
): Archetype<RequiredComponents & { [K in keyof C]: Schema.ToType<C[K]> }> => {
    const table = TABLE.createTable(components);
    const componentSet = new Set(Object.keys(components));

    // Mutable so we can rebuild it after fromData replaces columns. In the
    // hot path (no fromData) this stays the value built once at creation.
    let insertImpl: InsertImpl;
    const refreshInsertImpl = () => {
        insertImpl =
            buildSpecializedInsert(id, archetype.columns as Record<string, TypedBuffer<any>>, entityLocationTable) ??
            buildGenericInsert(id, entityLocationTable);
    };

    const createEntity = (rowData: Omit<{ [K in keyof C]: Schema.ToType<C[K]> }, "id">): Entity => {
        // archetype is closure-captured here. By the time createEntity
        // actually runs the const has been initialized.
        return insertImpl(archetype as any, rowData);
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
            // Restoring archetype state replaces archetype.columns with the
            // deserialized columns object. Rebuild insertImpl so the baked
            // column refs match the new live columns.
            refreshInsertImpl();
            // component set cannot be changed by this as the archetype components should be the same.
        }
    } as const satisfies Archetype<{ [K in keyof C]: Schema.ToType<C[K]> }> as Archetype<RequiredComponents & { [K in keyof C]: Schema.ToType<C[K]> }>;

    // Initial build, after `archetype` is in scope so the specialized
    // insert closes over the right columns.
    refreshInsertImpl();

    return archetype;
}