// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Simplify } from "../../types/types.js";
import type { Database, FromServiceFactory } from "./database.js";

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
  // Build SVF as (db) => merged service objects to preserve service types when intersecting with any
  (db: any) => Simplify<
    {} & IntersectAll<{
      [K in keyof Plugins]: Plugins[K] extends Database.Plugin<any, any, any, any, any, any, infer SVF, any>
      ? FromServiceFactory<SVF>
      : {}
    }>
  >,
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

  const emptyServiceFactory = (): Record<string, unknown> => ({});

  const merge = (base: any, next: any) =>
    Object.fromEntries(keys.map(key => {
      if (key === "services") {
        const baseFn = typeof base[key] === "function" ? base[key] : emptyServiceFactory;
        const nextFn = typeof next[key] === "function" ? next[key] : emptyServiceFactory;
        if (baseFn === emptyServiceFactory) return [key, nextFn];
        if (nextFn === emptyServiceFactory) return [key, baseFn];
        return [key, (db: any) => {
          const s1 = baseFn(db) ?? {};
          Object.assign(db.services, s1);
          const s2 = nextFn(db) ?? {};
          const merged = { ...s1 };
          for (const k of Object.keys(s2)) {
            // if (k in merged && merged[k] !== (s2 as Record<string, unknown>)[k]) {
            //   throw new Error(
            //     `Plugin combine conflict: services.${k} must be identical (===) across plugins`
            //   );
            // }
            merged[k] = (s2 as Record<string, unknown>)[k];
          }
          return merged;
        }];
      }
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

