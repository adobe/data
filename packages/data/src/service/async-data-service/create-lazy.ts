// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Observe } from "../../observe/index.js";
import { Schema } from "../../schema/index.js";
import { Service } from "../service.js";
import { EquivalentTypes } from "../../types/types.js";
import { memberKind } from "./member-kind.js";

// ============================================================================
// TYPE INFERENCE HELPERS
// ============================================================================

// Extract Service type from load function
type InferService<F> =
  F extends (...args: any[]) => Promise<infer S>
  ? S extends Service ? S : never
  : never;

// Extract Args type from load function
type InferArgs<F> =
  F extends () => Promise<any>
  ? void
  : F extends (args: infer A) => Promise<any>
  ? A
  : never;

// createLazy wraps observe values, functions (classified by what they return), and
// nested organizational groups of those (an `object` schema with its own
// `properties`, recursed at any depth). Constrain each member schema to those
// shapes so an unsupported member — a data property, or a function whose
// `returns` carries no recognized type — is a compile error at the call site
// rather than a runtime throw. The generic complete-schema gate would otherwise
// accept such members (e.g. a `returns` that resolves to `any`), leaving the
// runtime `memberKind` dispatch to disagree with the type-level check.
type LazyLeafSchema =
  | { readonly type: "observe" }
  | { readonly type: "function"; readonly signature?: { readonly returns?: { readonly type: "observe" | "promise" | "generator" } } };

interface LazyGroupSchema {
  readonly type: "object";
  readonly properties?: { readonly [name: string]: LazyMemberSchema };
}

type LazyMemberSchema = LazyLeafSchema | LazyGroupSchema;

type LazyServiceSchema = Schema & {
  readonly properties?: { readonly [name: string]: LazyMemberSchema };
};

// createLazy's gate: the schema must completely and correctly describe the loaded
// service's members. This is the actual correctness condition for building the
// wrappers, and it is INTENTIONALLY independent of `AsyncDataService.IsValid` —
// createLazy wraps whatever the schema describes, so a service that returns
// non-`Data` (e.g. a `fetch(): Promise<Response>` port) can still be lazily
// chunk-loaded as long as its schema matches. Enforce `IsValid` separately at the
// service's definition site if you also want async-data-service conformance.
type SchemaMatchesService<T extends Service, S extends Schema> =
  EquivalentTypes<Schema.ToType<S>, Omit<T, keyof Service>>;

// The `partial: true` gate: the loaded service must SATISFY the schema — every
// described member exists on it with a type assignable to the described one — but
// it may have more. The lazy instance carries only the described members.
type ServiceSatisfiesSchema<T extends Service, S extends Schema> =
  [Omit<T, keyof Service>] extends [Schema.ToType<S>] ? true : false;

type SchemaGate<T extends Service, S extends Schema, Partial extends boolean> =
  (Partial extends true ? ServiceSatisfiesSchema<T, S> : SchemaMatchesService<T, S>) extends true
    ? unknown
    // Inline (not a named type) so the mismatch marker isn't a documented symbol.
    : { schema: { readonly __createLazyError: "createLazy: schema must correctly describe the loaded service (completely, unless partial: true)" } };

// What a lazy instance is typed as: the loaded service, or — when `partial` — just
// the members the schema describes, plus the base `Service` slots (its `schema` is
// always present, since the instance publishes it up front).
type LazyInstance<T extends Service, S extends Schema, Partial extends boolean> =
  Partial extends true ? { readonly serviceName?: string; readonly schema: Observe<Schema> } & Schema.ToType<S> : T;

// ============================================================================
// MAIN FUNCTION SIGNATURE
// ============================================================================

/**
 * Creates a lazy-loading wrapper factory for an AsyncDataService.
 * By default the real service is only loaded when the first property is accessed.
 * All calls are queued and executed in order once the service loads.
 *
 * @param params - `load` returns the real service (may accept args); `schema` is the
 *   service's sideloaded object schema (e.g. `typeof MyService.schema`), which drives
 *   how each member is wrapped (nested `object` groups are wrapped recursively); `preload`
 *   (default false) warms the service at browser idle instead of waiting for the first
 *   property access; `partial` (default false) lets the schema describe a subset of the
 *   service — the instance then carries, and is typed as, only the described members.
 * @returns A factory function that creates lazy service instances
 *
 * TypeScript enforces that `schema` describes every member of the loaded service
 * with the correct wrapper kind (with `partial`, that every described member exists on
 * it with an assignable type); otherwise the `schema` argument fails to type-check
 * with a `__createLazyError` marker. This is the ONLY requirement — createLazy does
 * NOT require the service to be a valid `AsyncDataService`, so a service that returns
 * non-`Data` (e.g. `Promise<Response>`) can still be lazily loaded. Enforce
 * `AsyncDataService.IsValid` separately at the service definition site if you want it.
 * Note: member value/parameter schemas authored as `{}`
 * resolve to `any`, so presence and wrapper kind are checked but inner payload
 * types are only verified where a precise `value`/parameter schema is supplied.
 *
 * @example
 * ```typescript
 * // Service with no args
 * const createLazySimple = createLazy({
 *   load: () => import('./simple').then(m => m.create()),
 *   schema: SimpleService.schema,
 * });
 * const service = createLazySimple();
 *
 * // Service with args, warmed at browser idle
 * const createLazyConfig = createLazy({
 *   load: (config: Config) => import('./service').then(m => m.create(config)),
 *   schema: ConfigService.schema,
 *   preload: true,
 * });
 * const service = createLazyConfig({ apiUrl: '...' });
 * ```
 */
export function createLazy<
  LoadFn extends (...args: any[]) => Promise<Service>,
  const S extends LazyServiceSchema,
  const Partial extends boolean = false
>(
  params: {
    load: LoadFn,
    schema: S,
    preload?: boolean,
    partial?: Partial
  } & SchemaGate<InferService<LoadFn>, S, Partial>
): InferArgs<LoadFn> extends void
  ? () => LazyInstance<InferService<LoadFn>, S, Partial>
  : (args: InferArgs<LoadFn>) => LazyInstance<InferService<LoadFn>, S, Partial> {

  const { load, schema, preload } = params;

  // Return factory function that creates lazy service instances
  return ((...factoryArgs: any[]) => {
    type ServiceType = InferService<LoadFn>;

    // Shared loading state for this instance
    let loadPromise: Promise<ServiceType> | null = null;
    let loadedService: ServiceType | null = null;

    // Build lazy service object. Expose the schema up front (before load) so the
    // lazy instance is introspectable without triggering a load. The base slot is
    // `Observe<Schema>`, so publish the static contract as a constant observable.
    const lazyService: any = {
      serviceName: 'lazy-service',
      schema: Observe.fromConstant(schema),
    };

    const ensureLoading = (): Promise<ServiceType> => {
      if (loadedService) {
        return Promise.resolve(loadedService);
      }
      if (loadPromise) {
        return loadPromise;
      }

      loadPromise = (load as any)(...factoryArgs).then((service: ServiceType) => {
        loadedService = service;
        if (service.serviceName !== undefined && service.serviceName !== 'lazy-service') {
          // Update lazy service name once real service loads
          lazyService.serviceName = `lazy-${service.serviceName}`;
        }
        return service;
      });

      return loadPromise!;
    };

    // When preload is set, warm the service at browser idle instead of waiting for the first
    // property touch; ensureLoading memoizes, so it dedupes with that first touch.
    if (preload) {
      const idle = (globalThis as { requestIdleCallback?: (callback: () => void) => void }).requestIdleCallback;
      if (typeof idle === 'function') idle(() => { void ensureLoading(); });
    }

    // The node at `path` in the loaded service. Every depth resolves from the one
    // root load in a single step, so calls queued on members at different depths
    // still run in the order they were made.
    const nodeAt = (path: readonly string[]) => (): Promise<any> =>
      ensureLoading().then((root: any) => path.reduce((node, key) => node[key], root));

    Object.assign(lazyService, wrapMembers(schema.properties ?? {}, [], nodeAt));

    return lazyService as ServiceType;
  }) as any;
}

/**
 * The lazy wrappers for one service node's members, described by `properties`.
 * Leaves (`observe` / `function`) defer to the node `nodeAt(path)` resolves to;
 * nested `object` groups recurse under the extended path.
 */
function wrapMembers(
  properties: { readonly [key: string]: Schema },
  path: readonly string[],
  nodeAt: (path: readonly string[]) => () => Promise<any>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const getNode = nodeAt(path);
  for (const [key, member] of Object.entries(properties)) {
    if (member.type === 'object' || (member.type === undefined && member.properties !== undefined)) {
      out[key] = wrapMembers(member.properties ?? {}, [...path, key], nodeAt);
      continue;
    }
    const kind = memberKind(member);
    if (kind === 'observe') {
      // Observe property - defer subscription until service loads
      out[key] = (notify: any) => {
        let unobserveReal: (() => void) | null = null;
        let isCancelled = false;

        getNode().then((node: any) => {
          if (!isCancelled) {
            unobserveReal = node[key](notify);
          }
        });

        return () => {
          isCancelled = true;
          unobserveReal?.();
        };
      };
    } else if (kind === 'fn:promise') {
      // Promise function - queue calls and execute after load
      type QueuedCall = {
        args: any[];
        resolve: (value: any) => void;
        reject: (error: any) => void;
      };

      const queue: QueuedCall[] = [];
      let isProcessing = false;

      const runDrain = (node: any) => {
        (async () => {
          while (queue.length > 0) {
            const call = queue.shift()!;
            try {
              const result = await node[key](...call.args);
              call.resolve(result);
            } catch (error) {
              call.reject(error);
            }
          }
          isProcessing = false;
          if (queue.length > 0) {
            isProcessing = true;
            runDrain(node);
          }
        })();
      };

      out[key] = (...args: any[]): Promise<any> => {
        return new Promise((resolve, reject) => {
          queue.push({ args, resolve, reject });

          if (!isProcessing) {
            isProcessing = true;
            getNode()
              .then(runDrain)
              .catch(error => {
                while (queue.length > 0) {
                  queue.shift()!.reject(error);
                }
                isProcessing = false;
              });
          }
        });
      };
    } else if (kind === 'fn:void') {
      // Void function - queue calls and execute after load
      const queue: any[][] = [];
      let isProcessing = false;

      const runDrain = (node: any) => {
        while (queue.length > 0) {
          const args = queue.shift()!;
          node[key](...args);
        }
        isProcessing = false;
        if (queue.length > 0) {
          isProcessing = true;
          runDrain(node);
        }
      };

      out[key] = (...args: any[]): void => {
        queue.push(args);

        if (!isProcessing) {
          isProcessing = true;
          getNode().then(runDrain);
        }
      };
    } else if (kind === 'fn:observe') {
      // Observe function - returns Observe that waits for service
      out[key] = (...args: any[]): Observe<any> => {
        return (notify: any) => {
          let unobserveReal: (() => void) | null = null;
          let isCancelled = false;

          getNode().then((node: any) => {
            if (!isCancelled) {
              const realObserve = node[key](...args);
              unobserveReal = realObserve(notify);
            }
          });

          return () => {
            isCancelled = true;
            unobserveReal?.();
          };
        };
      };
    } else if (kind === 'fn:generator') {
      // AsyncGenerator function - returns generator that waits for service
      out[key] = (...args: any[]): AsyncGenerator<any> => {
        let realGenerator: AsyncGenerator<any> | null = null;
        let done = false;

        const gen = {
          async next(): Promise<IteratorResult<any>> {
            // Once terminated, never resurrect and start the real generator.
            if (done) return { done: true, value: undefined };
            if (!realGenerator) {
              const node = await getNode();
              realGenerator = node[key](...args);
            }
            const result = await realGenerator!.next();
            if (result.done) done = true;
            return result;
          },

          // Latch `done` so a subsequent next() cannot start the real generator;
          // delegate to it only when iteration has already begun.
          async return(value?: any): Promise<IteratorResult<any>> {
            done = true;
            if (realGenerator) {
              return realGenerator.return(value);
            }
            return { done: true, value: value as any };
          },

          async throw(e: any): Promise<IteratorResult<any>> {
            done = true;
            if (realGenerator) {
              return realGenerator.throw(e);
            }
            throw e;
          },

          [Symbol.asyncIterator]() {
            return this;
          },

          // Explicit resource management: `await using` disposes by terminating.
          async [Symbol.asyncDispose](): Promise<void> {
            await gen.return(undefined);
          },
        } as AsyncGenerator<any>;

        return gen;
      };
    }
  }
  return out;
}
