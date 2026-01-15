// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Simplify } from "../../types/types.js";
import type { Database } from "./database.js";

// Test: Binary combination type
export type Combine2Test<
    P1 extends Database.Plugin,
    P2 extends Database.Plugin
> = Database.Plugin<
   Simplify<{} & (P1 extends Database.Plugin<infer C1, any, any, any, any, any> ? C1 : never) &
        (P2 extends Database.Plugin<infer C2, any, any, any, any, any> ? C2 : never)>,
    Simplify<{} & (P1 extends Database.Plugin<any, infer R1, any, any, any, any> ? R1 : never) &
        (P2 extends Database.Plugin<any, infer R2, any, any, any, any> ? R2 : never)>,
    Simplify<{} & (P1 extends Database.Plugin<any, any, infer A1, any, any, any> ? A1 : never) &
        (P2 extends Database.Plugin<any, any, infer A2, any, any, any> ? A2 : never)>,
    Simplify<{} & (P1 extends Database.Plugin<any, any, any, infer TD1, any, any> ? TD1 : never) &
        (P2 extends Database.Plugin<any, any, any, infer TD2, any, any> ? TD2 : never)>,
    Extract<
        Simplify<(P1 extends Database.Plugin<any, any, any, any, infer S1, any> ? S1 : never) |
        (P2 extends Database.Plugin<any, any, any, any, infer S2, any> ? S2 : never)>,
        string
    >,
    (P1 extends Database.Plugin<any, any, any, any, any, infer AD1> ? AD1 : never) &
        (P2 extends Database.Plugin<any, any, any, any, any, infer AD2> ? AD2 : never)
>;

// Sample plugins for testing
type Plugin1 = Database.Plugin<
    { a: { readonly type: "number" } },
    { r1: { readonly default: boolean } },
    { A: readonly ["a"] },
    {},
    "system1",
    {}
>;

type Plugin2 = Database.Plugin<
    { b: { readonly type: "string" } },
    { r2: { readonly default: number } },
    { B: readonly ["b"] },
    {},
    "system2",
    {}
>;

type Plugin3 = Database.Plugin<
    { c: { readonly type: "boolean" } },
    { r3: { readonly default: string } },
    { C: readonly ["c"] },
    {},
    "system3",
    {}
>;

// Test: Combine2Test with two plugins
type TestCombine2 = Combine2Test<Plugin1, Plugin2>;

// Test: Nested Combine2Test (simulating plugin chain)
type TestNested = Combine2Test<Combine2Test<Plugin1, Plugin2>, Plugin3>;

// Export types to check in IDE
export type { TestCombine2, TestNested };

