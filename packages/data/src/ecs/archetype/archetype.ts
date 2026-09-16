// © 2026 Adobe. MIT License. See /LICENSE for details.
import { RequiredComponents, IdComponent } from "../required-components.js";
import { Entity } from "../entity/entity.js";
import { Table, ReadonlyTable } from "../../table/index.js";
import { Assert } from "../../types/assert.js";
import { Equal } from "../../types/equal.js";
import { Exact, Simplify, StringKeyof } from "../../types/types.js";

// `DK` (default-factory keys) names the components whose schema declares a
// `defaultFactory` (see Schema.defaultFactory). Those are OPTIONAL at insert:
// omit one and the archetype mints it via the factory; supply it (replication
// inbound / load) and the supplied value wins. Every other component stays
// required. `DK` defaults to `never`, so an archetype with no default factories
// keeps the original "all non-id components required" shape.
export type EntityInsertValues<C, DK extends keyof C = never> =
    // No default keys → exactly `Omit<C, IdComponent>` (byte-identical to the
    // original shape, so every existing archetype/store/transaction type is
    // unchanged). Only when default keys exist do we split them out as optional.
    [DK] extends [never]
        ? Omit<C, IdComponent>
        : Simplify<
            & Omit<C, IdComponent | DK>
            & Partial<Pick<C, Exclude<Extract<DK, keyof C>, IdComponent>>>
        >;
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

export interface Archetype<C = {}, DK extends keyof C = never> extends BaseArchetype, Table<C & RequiredComponents> {
    readonly components: ComponentSet<StringKeyof<C>>;
    insert: <T extends EntityInsertValues<C, DK>>(rowData: Exact<EntityInsertValues<C, DK>, T>) => Entity;
    /** See {@link ReadonlyArchetype.toData}. */
    toData: (copy?: boolean, omit?: ReadonlySet<string>) => unknown
    /**
     * Restore column data. `rehome` (set by the snapshot-restore path) re-homes
     * adopted default-allocated columns onto the archetype's injected allocator,
     * so a loaded store keeps its arena backing; it is a no-op without a custom
     * allocator.
     */
    fromData: (data: unknown, rehome?: boolean) => void
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
    export interface Router<C = {}, DK extends keyof C = never> {
        readonly components: ComponentSet<StringKeyof<C>>;
        insert: <T extends EntityInsertValues<C, DK>>(rowData: Exact<EntityInsertValues<C, DK>, T>) => Entity;
    }
}

// `id` is stripped explicitly: inferring `C` from an archetype can pull `id` in
// via the `columns` position (typed `C & RequiredComponents`), but `id` is never
// part of the component row.
export type FromArchetype<T> =
    T extends ReadonlyArchetype<infer C> ? { readonly [K in keyof Omit<C, IdComponent>]: C[K] } :
    T extends Archetype<infer C, any> ? { readonly [K in keyof Omit<C, IdComponent>]: C[K] } :
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

// Compile-time tests for default-factory optionality (DK).
{
    // guid names a default factory → optional at insert; position stays required.
    type GuidArchetype = Archetype<{ guid: [number, number], position: [number, number, number] }, "guid">;

    const testOmitDefaulted = (arch: GuidArchetype) => {
        // guid omitted → the archetype mints it. Must compile.
        arch.insert({ position: [0, 0, 0] });
        // guid supplied (replication-inbound / load path) → wins. Must compile.
        arch.insert({ position: [0, 0, 0], guid: [1, 2] });
    };

    const testStillRequired = (arch: GuidArchetype) => {
        // @ts-expect-error - position is not a default-factory key, still required.
        arch.insert({ guid: [1, 2] });
    };

    // A defaulted key is only optional, never removed: EntityInsertValues keeps it.
    type Values = EntityInsertValues<{ guid: [number, number], position: [number, number, number] }, "guid">;
    type TestGuidOptional = Assert<Equal<Values, { position: [number, number, number]; guid?: [number, number] }>>;
}