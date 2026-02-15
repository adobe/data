// © 2026 Adobe. MIT License. See /LICENSE for details.
import { RequiredComponents } from "../required-components.js";
import { Entity } from "../entity.js";
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
    toData: () => unknown
}

export interface Archetype<C extends RequiredComponents = RequiredComponents> extends BaseArchetype, Table<C> {
    readonly components: ComponentSet<StringKeyof<C>>;
    insert: <T extends EntityInsertValues<C>>(rowData: Exact<EntityInsertValues<C>, T>) => Entity;
    toData: () => unknown
    fromData: (data: unknown) => void
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