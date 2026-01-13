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

import { Assert } from "../../types/assert.js";
import { Equal } from "../../types/equal.js";
import { IntersectTuple, UnionTuple, Simplify } from "../../types/types.js";
import { Entity } from "../entity.js";
import { Store } from "../store/store.js";
import type { Database, SystemDeclarations } from "./database.js";

// Binary combination type - combines exactly two plugins into a flat Database.Plugin
export type Combine2<
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

// Three-way combination
export type Combine3<
    P1 extends Database.Plugin,
    P2 extends Database.Plugin,
    P3 extends Database.Plugin
> = Combine2<Combine2<P1, P2>, P3>;

// Four-way combination
export type Combine4<
    P1 extends Database.Plugin,
    P2 extends Database.Plugin,
    P3 extends Database.Plugin,
    P4 extends Database.Plugin
> = Combine2<Combine2<Combine2<P1, P2>, P3>, P4>;


/**
 * Combines multiple plugins into a single plugin.
 * All plugin properties (components, resources, archetypes, transactions, systems, actions)
 * require identity (===) when the same key exists across plugins.
 */
export function combinePlugins<
  const P1 extends Database.Plugin,
  const P2 extends Database.Plugin
>(p1: P1, p2: P2):
  Database.Plugin<
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
export function combinePlugins<
  const P1 extends Database.Plugin,
  const P2 extends Database.Plugin,
  const P3 extends Database.Plugin
>(p1: P1, p2: P2, p3: P3): Combine3<P1, P2, P3>;
export function combinePlugins<
  const P1 extends Database.Plugin,
  const P2 extends Database.Plugin,
  const P3 extends Database.Plugin,
  const P4 extends Database.Plugin
>(p1: P1, p2: P2, p3: P3, p4: P4): Combine4<P1, P2, P3, P4>;
export function combinePlugins<
  const Plugins extends readonly Database.Plugin[]
>(...plugins: Plugins): any {
  const keys = ['components', 'resources', 'archetypes', 'transactions', 'systems', 'actions'] as const;
  
  const merge = (base: any, next: any) => 
    Object.fromEntries(keys.map(key => {
      const baseObj = base[key] ?? {};
      const nextObj = next[key] ?? {};
      
      // All keys require identity (===) check
      const merged = { ...baseObj };
      for (const [k, v] of Object.entries(nextObj)) {
        if (k in baseObj && baseObj[k] !== v) {
          throw new Error(
            `Plugin combine conflict: ${key}.${k} must be identical (===) across plugins`
          );
        }
        merged[k] = v;
      }
      return [key, merged];
    }));
  
  const emptyPlugin = { components: {}, resources: {}, archetypes: {}, transactions: {}, systems: {}, actions: {} };
  
  // Merge all plugins together
  const result = plugins.reduce(merge, emptyPlugin);
  
  return result;
}

