/*MIT License

© Copyright 2025 Adobe. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.*/
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