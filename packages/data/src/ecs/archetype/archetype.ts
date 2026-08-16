// © 2026 Adobe. MIT License. See /LICENSE for details.
import { RequiredComponents, IdComponent } from "../required-components.js";
import { Entity } from "../entity/entity.js";
import { Table, ReadonlyTable } from "../../table/index.js";
import { Assert } from "../../types/assert.js";
import { Equal } from "../../types/equal.js";
import { Exact, StringKeyof } from "../../types/types.js";

export type EntityInsertValues<C> = Omit<C, IdComponent>;
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

// `C` is the archetype's *component* set and deliberately excludes the entity
// `id`. The id is the entity's identity (the key), not one of its component
// values, so it never appears in `C`, in `FromArchetype`, or in any full read.
// It remains a real, always-present COLUMN: the interfaces below re-inject it
// into `columns` (via `C & RequiredComponents`) so swap-remove and manual
// per-row traversal can still read `archetype.columns.id.get(row)` directly,
// which is required and must stay fast.
export interface ReadonlyArchetype<C = {}> extends BaseArchetype, ReadonlyTable<C & RequiredComponents> {
    readonly components: ComponentSet<StringKeyof<C>>;
    /**
     * Serialize the archetype. When `copy` is true each column buffer is
     * detached (`.copy()`) so the snapshot survives later mutation of the live
     * archetype; otherwise the snapshot references the live column buffers
     * (faster, but only valid until the next mutation).
     *
     * `omit` names columns to exclude from the snapshot (e.g. nonPersistent
     * components). `fromData` rebuilds any omitted column fresh, so the archetype
     * stays structurally intact.
     */
    toData: (copy?: boolean, omit?: ReadonlySet<string>) => unknown
}

export interface Archetype<C = {}> extends BaseArchetype, Table<C & RequiredComponents> {
    readonly components: ComponentSet<StringKeyof<C>>;
    insert: <T extends EntityInsertValues<C>>(rowData: Exact<EntityInsertValues<C>, T>) => Entity;
    /** See {@link ReadonlyArchetype.toData}. */
    toData: (copy?: boolean, omit?: ReadonlySet<string>) => unknown
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
    export interface Router<C = {}> {
        readonly components: ComponentSet<StringKeyof<C>>;
        insert: <T extends EntityInsertValues<C>>(rowData: Exact<EntityInsertValues<C>, T>) => Entity;
    }
}

// `id` is stripped explicitly: inferring `C` from an archetype can pull `id` in
// via the `columns` position (typed `C & RequiredComponents`), but `id` is never
// part of the component row.
export type FromArchetype<T> =
    T extends ReadonlyArchetype<infer C> ? { readonly [K in keyof Omit<C, IdComponent>]: C[K] } :
    T extends Archetype<infer C> ? { readonly [K in keyof Omit<C, IdComponent>]: C[K] } :
    never;

// compile time type tests.
// `id` is not a component: it is absent from `C` and therefore from FromArchetype…
type TestFromReadonlyArchetype = Assert<Equal<FromArchetype<ReadonlyArchetype<{ a: number, b: string }>>, { readonly a: number, readonly b: string }>>;
type TestFromArchetype = Assert<Equal<FromArchetype<Archetype<{ a: number, b: string }>>, { readonly a: number, readonly b: string }>>;
// …but it remains a real, typed column so swap-remove / manual traversal can read
// `columns.id` directly: `id` is present in `columns` even though it is not in `C`.
type TestIdColumnStillTyped = Assert<IdComponent extends keyof Archetype<{ a: number }>["columns"] ? true : false>;

// Compile-time tests for Exact in insert method
{
    type TestArchetype = Archetype<{ position: [number, number, number], color: [number, number, number, number] }>;
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