// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * One component's values in a table, copies taken as a readonly system reads `tables`:
 * - `bytes`: a struct's or number's, `stride` bytes per row in the world's layout for it, which is a function of the
 *   component's schema alone;
 * - `values`: a string's or an object's, one per row;
 * - `value`: one value every row holds, for a shared component or one whose schema is a constant.
 */
export type Column =
    | { readonly kind: "bytes"; readonly bytes: Uint8Array; readonly stride: number }
    | { readonly kind: "values"; readonly values: readonly unknown[] }
    | { readonly kind: "value"; readonly value: unknown };

/**
 * What `commands.spawnTables` spawned: each table's entities in its row order, the one spawned for each row, the one
 * existing for a row its `existing` maps, and `Entity.none` for a row it didn't spawn; and how many rows it didn't,
 * those owned by an entity outside the tables.
 */
export type Spawned = { readonly entities: readonly Float64Array[]; readonly dropped: number };
