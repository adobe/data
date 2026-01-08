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
import { IntersectTuple, UnionTuple } from "../../types/types.js";
import { Entity } from "../entity.js";
import { Store } from "../store/store.js";
import type { Database, SystemDeclarations } from "./database.js";

export type CombinePlugins<Plugins extends readonly Database.Plugin[]> =
    Database.Plugin<
        {} & IntersectTuple<{ [K in keyof Plugins]: Plugins[K] extends Database.Plugin<infer C, any, any, any, any, any> ? C : never }>,
        {} & IntersectTuple<{ [K in keyof Plugins]: Plugins[K] extends Database.Plugin<any, infer R, any, any, any, any> ? R : never }>,
        {} & IntersectTuple<{ [K in keyof Plugins]: Plugins[K] extends Database.Plugin<any, any, infer A, any, any, any> ? A : never }>,
        {} & IntersectTuple<{ [K in keyof Plugins]: Plugins[K] extends Database.Plugin<any, any, any, infer TD, any, any> ? TD : never }>,
        Extract<UnionTuple<{ [K in keyof Plugins]: Plugins[K] extends Database.Plugin<any, any, any, any, infer S, any> ? S : never }>, string>,
        {} & IntersectTuple<{ [K in keyof Plugins]: Plugins[K] extends Database.Plugin<any, any, any, any, any, infer AD> ? AD : never }>
    >

type CombinedPlugins = CombinePlugins<[
    Database.Plugin<{a: { readonly type: "number" }}, { c: { readonly default: boolean } }, { readonly A: readonly ["a"]}, { readonly doFoo: (store: Store, args: { a: number }) => Entity }, "system1", {}>,
    Database.Plugin<{b: { readonly type: "string" }}, { d: { readonly default: boolean } }, { readonly B: readonly ["b"]}, { readonly doBar: (store: Store) => void }, "system2", {}>,
]>;
type CheckCombinedPlugins = Assert<Equal<CombinedPlugins, {
    readonly components: {
        a: {
            readonly type: "number";
        };
        b: {
            readonly type: "string";
        };
    };
    readonly resources: {
        c: {
            readonly default: boolean;
        };
        d: {
            readonly default: boolean;
        };
    };
    readonly archetypes: {
        readonly A: readonly ["a"];
        readonly B: readonly ["b"];
    };
    readonly transactions: {
        readonly doFoo: (store: Store, args: {
            a: number;
        }) => Entity;
        readonly doBar: (store: Store) => void;
    };
    readonly systems: SystemDeclarations<"system1" | "system2">;
    readonly actions: {};
}>>;

/**
 * Combines multiple plugins into a single plugin.
 * All plugin properties (components, resources, archetypes, transactions, systems, actions)
 * require identity (===) when the same key exists across plugins.
 */
export function combinePlugins<
  const Plugins extends readonly Database.Plugin[]
>(
  ...plugins: Plugins
): CombinePlugins<Plugins> {
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
  
  return result as any;
}

