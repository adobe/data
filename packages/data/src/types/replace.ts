// © 2026 Adobe. MIT License. See /LICENSE for details.
export type Replace<T, Find, Replacement> =
    T extends Find
    ? Replacement
    : T extends readonly (infer U)[]
    ? Replace<U, Find, Replacement>[]
    : T extends object
    ? {
        [K in keyof T]: Replace<T[K], Find, Replacement>;
    }
    : T;

import { True, False, EquivalentTypes } from "./types.js";

// Compile-time type checking tests
{
    // Basic primitive replacement
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- compile time type check
    type BasicReplace = True<EquivalentTypes<Replace<string, string, number>, number>>;

    // Object property replacement
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- compile time type check
    type ObjectReplace = True<
        EquivalentTypes<
            Replace<{ a: { b: { c: string } } }, string, number>,
            { a: { b: { c: number } } }
        >
    >;

    // Array element replacement
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- compile time type check
    type ArrayReplace = True<EquivalentTypes<Replace<string[], string, number>, number[]>>;

    // Readonly array element replacement
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- compile time type check
    type ReadonlyArrayReplace = True<
        EquivalentTypes<Replace<readonly string[], string, number>, number[]>
    >;

    // No replacement when Find type doesn't exist
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- compile time type check
    type NoReplace = True<
        EquivalentTypes<Replace<{ a: number; b: boolean }, string, symbol>, { a: number; b: boolean }>
    >;

    // Complex nested structure with mixed types
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- compile time type check
    type ComplexReplace = True<
        EquivalentTypes<
            Replace<
                {
                    users: string[];
                    metadata: { id: string; active: boolean };
                    settings: readonly string[];
                },
                string,
                number
            >,
            {
                users: number[];
                metadata: { id: number; active: boolean };
                settings: number[];
            }
        >
    >;

    // Replacement in nested arrays
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- compile time type check
    type NestedArrayReplace = True<
        EquivalentTypes<Replace<string[][], string, number>, number[][]>
    >;

    // Multiple occurrences replacement
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- compile time type check
    type MultipleReplace = True<
        EquivalentTypes<
            Replace<{ a: string; b: { c: string; d: number } }, string, symbol>,
            { a: symbol; b: { c: symbol; d: number } }
        >
    >;
}