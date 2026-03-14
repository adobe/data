// © 2026 Adobe. MIT License. See /LICENSE for details.

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
  Simplify<{} & IntersectAll<{ [K in keyof Plugins]: Plugins[K] extends Database.Plugin<infer C, any, any, any, any, any, any, any> ? C : never }>>,
  Simplify<{} & IntersectAll<{ [K in keyof Plugins]: Plugins[K] extends Database.Plugin<any, infer R, any, any, any, any, any, any> ? R : never }>>,
  Simplify<{} & IntersectAll<{ [K in keyof Plugins]: Plugins[K] extends Database.Plugin<any, any, infer A, any, any, any, any, any> ? A : never }>>,
  Simplify<{} & IntersectAll<{ [K in keyof Plugins]: Plugins[K] extends Database.Plugin<any, any, any, infer TD, any, any, any, any> ? TD : never }>>,
  Extract<
    Simplify<UnionAll<{ [K in keyof Plugins]: Plugins[K] extends Database.Plugin<any, any, any, any, infer S, any, any, any> ? S : never }>>,
    string
  >,
  Simplify<{} & IntersectAll<{ [K in keyof Plugins]: Plugins[K] extends Database.Plugin<any, any, any, any, any, infer AD, any, any> ? AD : never }>>,
  Simplify<{} & IntersectAll<{ [K in keyof Plugins]: Plugins[K] extends Database.Plugin<any, any, any, any, any, any, infer SVF, any> ? SVF : never }>>,
  Simplify<{} & IntersectAll<{ [K in keyof Plugins]: Plugins[K] extends Database.Plugin<any, any, any, any, any, any, any, infer CVF> ? CVF : never }>>
>;


/**
 * Combines multiple plugins into a single plugin.
 * All plugin properties (components, resources, archetypes, computed, transactions, systems, actions, services)
 * require identity (===) when the same key exists across plugins.
 * 
 * IMPORTANT: Services are merged in order, preserving the initialization order
 * so that extended plugin services are initialized before current plugin services.
 */
export function combinePlugins<
  const Plugins extends readonly Database.Plugin[]
>(...plugins: Plugins): CombinePlugins<Plugins> {
  const keys = ['services', 'components', 'resources', 'archetypes', 'computed', 'transactions', 'actions', 'systems'] as const;

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

  const emptyPlugin = { components: {}, resources: {}, archetypes: {}, computed: {}, transactions: {}, actions: {}, systems: {}, services: {} };

  // Merge all plugins together
  const result = plugins.reduce(merge, emptyPlugin);

  return result as CombinePlugins<Plugins>;
}

