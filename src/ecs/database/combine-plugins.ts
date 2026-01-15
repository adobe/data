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

// Helper to intersect all elements (works with mapped types over tuples)
type IntersectAll<T extends readonly unknown[]> = Simplify<
  T extends readonly [infer H, ...infer R] ? H & IntersectAll<R> : unknown
>;
type UnionAll<T extends readonly unknown[]> = Simplify<
  T extends readonly [infer H, ...infer R] ? H | UnionAll<R> : never
>;

// Array-based combination type - combines plugins from an array into a flat Database.Plugin
export type CombinePlugins<Plugins extends readonly Database.Plugin[]> = Database.Plugin<
    Simplify<{} & IntersectAll<{ [K in keyof Plugins]: Plugins[K] extends Database.Plugin<infer C, any, any, any, any, any> ? C : never }>>,
    Simplify<{} & IntersectAll<{ [K in keyof Plugins]: Plugins[K] extends Database.Plugin<any, infer R, any, any, any, any> ? R : never }>>,
    Simplify<{} & IntersectAll<{ [K in keyof Plugins]: Plugins[K] extends Database.Plugin<any, any, infer A, any, any, any> ? A : never }>>,
    Simplify<{} & IntersectAll<{ [K in keyof Plugins]: Plugins[K] extends Database.Plugin<any, any, any, infer TD, any, any> ? TD : never }>>,
    Extract<
        Simplify<UnionAll<{ [K in keyof Plugins]: Plugins[K] extends Database.Plugin<any, any, any, any, infer S, any> ? S : never }>>,
        string
    >,
    Simplify<{} & IntersectAll<{ [K in keyof Plugins]: Plugins[K] extends Database.Plugin<any, any, any, any, any, infer AD> ? AD : never }>>
>;


/**
 * Combines multiple plugins into a single plugin.
 * All plugin properties (components, resources, archetypes, transactions, systems, actions)
 * require identity (===) when the same key exists across plugins.
 */
export function combinePlugins<
  const Plugins extends readonly Database.Plugin[]
>(...plugins: Plugins): CombinePlugins<Plugins> {
  const keys = ['components', 'resources', 'archetypes', 'transactions', 'actions', 'systems'] as const;
  
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
  
  const emptyPlugin = { components: {}, resources: {}, archetypes: {}, transactions: {}, actions: {}, systems: {} };
  
  // Merge all plugins together
  const result = plugins.reduce(merge, emptyPlugin);
  
  return result as CombinePlugins<Plugins>;
}

