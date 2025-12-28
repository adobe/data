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
import { Simplify } from "../../types/types.js";
import { Entity } from "../entity.js";
import { Store } from "../store/store.js";
import type { Database } from "./database.js";

// Helper to intersect all elements of a tuple
type IntersectAll<T extends readonly unknown[]> = Simplify<
  T extends readonly [infer H, ...infer R] ? H & IntersectAll<R> : unknown
>;
type UnionAll<T extends readonly unknown[]> = Simplify<
  T extends readonly [infer H, ...infer R] ? H | UnionAll<R> : never
>;

export type CombinePlugins<Plugins extends readonly Database.Plugin[]> = {
  components: IntersectAll<{ [K in keyof Plugins]: Plugins[K] extends Database.Plugin<infer C, any, any, any, any> ? C : never }>;
  resources: IntersectAll<{ [K in keyof Plugins]: Plugins[K] extends Database.Plugin<any, infer R, any, any, any> ? R : never }>;
  archetypes: IntersectAll<{ [K in keyof Plugins]: Plugins[K] extends Database.Plugin<any, any, infer A, any, any> ? A : never }>;
  transactions: IntersectAll<{ [K in keyof Plugins]: Plugins[K] extends Database.Plugin<any, any, any, infer TD, any> ? TD : never }>;
  systems: UnionAll<{ [K in keyof Plugins]: Plugins[K] extends Database.Plugin<any, any, any, any, infer S> ? S : never }>;
};

type CombinedPlugins = CombinePlugins<[
    Database.Plugin<{a: { readonly type: "number" }}, { c: { readonly default: boolean } }, { readonly A: readonly ["a"]}, { readonly doFoo: (store: Store, args: { a: number }) => Entity }, "system1">,
    Database.Plugin<{b: { readonly type: "string" }}, { d: { readonly default: boolean } }, { readonly B: readonly ["b"]}, { readonly doBar: (store: Store) => void }, "system2">,
]>;
type CheckCombinedPlugins = Assert<Equal<CombinedPlugins, {
    components: {
        a: {
            readonly type: "number";
        };
        b: {
            readonly type: "string";
        };
    };
    resources: {
        c: {
            readonly default: boolean;
        };
        d: {
            readonly default: boolean;
        };
    };
    archetypes: {
        readonly A: readonly ["a"];
        readonly B: readonly ["b"];
    };
    transactions: {
        readonly doFoo: (store: Store, args: { a: number }) => Entity;
        readonly doBar: (store: Store) => void;
    };
    systems: "system1" | "system2";
}>>;

/**
 * Combines multiple plugins into a single plugin.
 * Components, resources, archetypes, and transactions are intersected.
 * Systems are merged (all system definitions from all plugins are included).
 */
export function combinePlugins<
  const Plugins extends readonly Database.Plugin[]
>(
  ...plugins: Plugins
): CombinePlugins<Plugins> {
  const requireIdentity = new Set(['components', 'resources', 'archetypes']);
  const keys = ['components', 'resources', 'archetypes', 'transactions', 'systems'] as const;
  
  const merge = (base: any, next: any) => 
    Object.fromEntries(keys.map(key => {
      const baseObj = base[key] ?? {};
      const nextObj = next[key] ?? {};
      
      if (requireIdentity.has(key)) {
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
      }
      
      // For transactions and systems, merge objects
      return [key, { ...baseObj, ...nextObj }];
    }));
  
  const emptyPlugin = { components: {}, resources: {}, archetypes: {}, transactions: {}, systems: {} };
  
  // Merge all plugins together
  const result = plugins.reduce(merge, emptyPlugin);
  
  return result as any;
}

