// © 2026 Adobe. MIT License. See /LICENSE for details.
import { RequiredComponents } from "../required-components.js";
import { Entity } from "../entity/entity.js";
import { Table, ReadonlyTable } from "../../table/index.js";
import { Assert } from "../../types/assert.js";
import { Equal } from "../../types/equal.js";
import { Exact, StringKeyof } from "../../types/types.js";

export type EntityInsertValues<C> = Omit<C, "id">;
export type ArchetypeId = number;

/**
 * Component set that narrows iteration to known component keys
 * while keeping .has() and set comparisons accepting any string.
 */
interface ComponentSet<T extends string> extends ReadonlySet<T> {
    has(value: string): boolean;
    isSupersetOf(other: ReadonlySet<string>): boolean;
    isSubsetOf(other: ReadonlySet<string>): boolean;
    isDisjointFrom(other: ReadonlySet<string>): boolean;
}

interface BaseArchetype {
    readonly id: ArchetypeId;
    readonly components: ReadonlySet<string>;
}
export interface ReadonlyArchetype<C extends RequiredComponents> extends BaseArchetype, ReadonlyTable<C> {
    readonly components: ComponentSet<StringKeyof<C>>;
    /**
     * Serialize the archetype. When `copy` is true each column buffer is
     * detached (`.copy()`) so the snapshot survives later mutation of the live
     * archetype; otherwise the snapshot references the live column buffers
     * (faster, but only valid until the next mutation).
     */
    toData: (copy?: boolean) => unknown
}

export interface Archetype<C extends RequiredComponents = RequiredComponents> extends BaseArchetype, Table<C> {
    readonly components: ComponentSet<StringKeyof<C>>;
    insert: <T extends EntityInsertValues<C>>(rowData: Exact<EntityInsertValues<C>, T>) => Entity;
    /** See {@link ReadonlyArchetype.toData}. */
    toData: (copy?: boolean) => unknown
    fromData: (data: unknown) => void
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Archetype {
    /**
     * Write-only handle over a *family* of archetypes that share a component set
     * but differ by the value of one or more `partition` components. `insert`
     * reads the partition value(s) from the row, resolves (creating on first use)
     * the concrete child archetype for that value, and inserts there.
     *
     * A family has no single dense column view, so — unlike {@link Archetype} — a
     * Router exposes no `columns`, `rowCount`, or iteration. Read a family through
     * `queryArchetypes` (optionally filtered by partition value), or narrow to one
     * concrete member by supplying the value to `ensureArchetype`.
     *
     * `insert` is deliberately signature-identical to {@link Archetype.insert}: a
     * discriminated `Archetype<C> | Archetype.Router<C>` (produced when the
     * requested keys are not statically known to include/exclude a partition
     * component) therefore still permits `.insert` with no narrowing — only dense
     * column access requires having resolved to a concrete {@link Archetype}.
     */
    export interface Router<C extends RequiredComponents = RequiredComponents> {
        readonly components: ComponentSet<StringKeyof<C>>;
        insert: <T extends EntityInsertValues<C>>(rowData: Exact<EntityInsertValues<C>, T>) => Entity;
    }
}

export type FromArchetype<T> =
    T extends ReadonlyArchetype<infer C> ? { readonly [K in keyof C]: C[K] } :
    T extends Archetype<infer C> ? { readonly [K in keyof C]: C[K] } :
    never;

// compile time type tests.
type TestFromReadonlyArchetype = Assert<Equal<FromArchetype<ReadonlyArchetype<{ id: number, a: number, b: string }>>, { readonly id: number, readonly a: number, readonly b: string }>>;
type TestFromArchetype = Assert<Equal<FromArchetype<Archetype<{ id: number, a: number, b: string }>>, { readonly id: number, readonly a: number, readonly b: string }>>;

// Compile-time tests for Exact in insert method
{
    type TestArchetype = Archetype<{ id: Entity, position: [number, number, number], color: [number, number, number, number] }>;
    type TestInsertValid = { position: [number, number, number], color: [number, number, number, number] };
    type TestInsertExtra = { position: [number, number, number], color: [number, number, number, number], extra: string };

    // Valid insert should work
    const testValidInsert = (arch: TestArchetype) => {
        const validData: TestInsertValid = { position: [0, 0, 0], color: [1, 1, 1, 1] };
        arch.insert(validData); // Should compile
    };

    // Insert with extra properties should fail
    const testInvalidInsert = (arch: TestArchetype) => {
        const invalidData: TestInsertExtra = { position: [0, 0, 0], color: [1, 1, 1, 1], extra: "bad" };
        // @ts-expect-error - Should reject extra properties
        arch.insert(invalidData);
    };
}