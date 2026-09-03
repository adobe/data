// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Observe } from "../../observe/index.js";
import { Schema } from "../../schema/index.js";
import { Service } from "../service.js";
import { EquivalentTypes } from "../../types/types.js";

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

// createLazy only wraps observe values and functions (classified by what they
// return). Constrain each member schema to those shapes so an unsupported member
// — a nested organizational object, a data property, or a function whose
// `returns` carries no recognized type — is a compile error at the call site
// rather than a runtime throw. The generic complete-schema gate would otherwise
// accept such members (e.g. a `returns` that resolves to `any`), leaving the
// runtime `memberKind` dispatch to disagree with the type-level check.
type LazyMemberSchema =
  | { readonly type: "observe" }
  | { readonly type: "function"; readonly signature?: { readonly returns?: { readonly type: "observe" | "promise" | "generator" } } };

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

// ============================================================================
// RUNTIME WRAPPER KIND
// ============================================================================

type WrapKind = "observe" | "fn:observe" | "fn:promise" | "fn:generator" | "fn:void";

// The runtime wrapper strategy for a service member, derived from its schema:
// an `observe` value, or a `function` classified by what it returns. Well-typed
// callers can never reach a throw (the LazyServiceSchema constraint rejects
// unsupported members at compile time); the throws defend untyped/`any` callers.
function memberKind(member: Schema): WrapKind {
  if (member.type === "observe") return "observe";
  if (member.type === "function") {
    const returns = member.signature?.returns;
    if (returns === undefined) return "fn:void"; // absent returns ⇒ void
    switch (returns.type) {
      case "observe": return "fn:observe";
      case "promise": return "fn:promise";
      case "generator": return "fn:generator";
      default:
        // A present `returns` with an unrecognized type must not silently become
        // void (that would drop the result); fail loudly instead.
        throw new Error(
          `createLazy: unsupported function returns schema type "${returns.type}" — must be observe, promise, generator, or omitted (void)`,
        );
    }
  }
  throw new Error(
    `createLazy: unsupported member schema type "${member.type}" — service members must be observe or function schemas`,
  );
}

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
 *   how each member is wrapped; `preload` (default false) warms the service at browser
 *   idle instead of waiting for the first property access.
 * @returns A factory function that creates lazy service instances
 *
 * TypeScript enforces that `schema` describes every member of the loaded service
 * with the correct wrapper kind; otherwise the `schema` argument fails to type-check
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
  const S extends LazyServiceSchema
>(
  params: {
    load: LoadFn,
    schema: S,
    preload?: boolean
  } & (SchemaMatchesService<InferService<LoadFn>, S> extends true
    ? unknown
    // Inline (not a named type) so the mismatch marker isn't a documented symbol.
    : { schema: { readonly __createLazyError: "createLazy: schema must completely and correctly describe the loaded service" } })
): InferArgs<LoadFn> extends void
  ? () => InferService<LoadFn>
  : (args: InferArgs<LoadFn>) => InferService<LoadFn> {

  const { load, schema, preload } = params;
  const properties = schema.properties ?? {};

  // Return factory function that creates lazy service instances
  return ((...factoryArgs: any[]) => {
    type ServiceType = InferService<LoadFn>;

    // Shared loading state for this instance
    let loadPromise: Promise<ServiceType> | null = null;
    let loadedService: ServiceType | null = null;

    const ensureLoading = (): Promise<ServiceType> => {
      if (loadedService) {
        return Promise.resolve(loadedService);
      }
      if (loadPromise) {
        return loadPromise;
      }

      loadPromise = (load as any)(...factoryArgs).then((service: ServiceType) => {
        loadedService = service;
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

    // Build lazy service object. Expose the schema up front (before load) so the
    // lazy instance is introspectable without triggering a load.
    const lazyService: any = {
      serviceName: 'lazy-service',
      schema,
    };

    // Wrap each member based on the strategy derived from its schema
    for (const [key, member] of Object.entries(properties)) {
      const kind = memberKind(member);
      if (kind === 'observe') {
        // Observe property - defer subscription until service loads
        lazyService[key] = (notify: any) => {
          let unobserveReal: (() => void) | null = null;
          let isCancelled = false;

          ensureLoading().then((service: any) => {
            if (!isCancelled && service.serviceName !== undefined && service.serviceName !== 'lazy-service') {
              // Update lazy service name once real service loads
              lazyService.serviceName = `lazy-${service.serviceName}`;
            }
            if (!isCancelled) {
              unobserveReal = service[key](notify);
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

        const runDrain = (service: any) => {
          (async () => {
            while (queue.length > 0) {
              const call = queue.shift()!;
              try {
                const result = await service[key](...call.args);
                call.resolve(result);
              } catch (error) {
                call.reject(error);
              }
            }
            isProcessing = false;
            if (queue.length > 0) {
              isProcessing = true;
              runDrain(service);
            }
          })();
        };

        lazyService[key] = (...args: any[]): Promise<any> => {
          return new Promise((resolve, reject) => {
            queue.push({ args, resolve, reject });

            if (!isProcessing) {
              isProcessing = true;
              ensureLoading()
                .then((service: any) => {
                  if (service.serviceName !== undefined && service.serviceName !== 'lazy-service') {
                    lazyService.serviceName = `lazy-${service.serviceName}`;
                  }
                  runDrain(service);
                })
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

        const runDrain = (service: any) => {
          while (queue.length > 0) {
            const args = queue.shift()!;
            service[key](...args);
          }
          isProcessing = false;
          if (queue.length > 0) {
            isProcessing = true;
            runDrain(service);
          }
        };

        lazyService[key] = (...args: any[]): void => {
          queue.push(args);

          if (!isProcessing) {
            isProcessing = true;
            ensureLoading().then((service: any) => {
              if (service.serviceName !== undefined && service.serviceName !== 'lazy-service') {
                lazyService.serviceName = `lazy-${service.serviceName}`;
              }
              runDrain(service);
            });
          }
        };
      } else if (kind === 'fn:observe') {
        // Observe function - returns Observe that waits for service
        lazyService[key] = (...args: any[]): Observe<any> => {
          return (notify: any) => {
            let unobserveReal: (() => void) | null = null;
            let isCancelled = false;

            ensureLoading().then((service: any) => {
              if (service.serviceName !== undefined && service.serviceName !== 'lazy-service') {
                lazyService.serviceName = `lazy-${service.serviceName}`;
              }
              if (!isCancelled) {
                const realObserve = service[key](...args);
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
        lazyService[key] = (...args: any[]): AsyncGenerator<any> => {
          let realGenerator: AsyncGenerator<any> | null = null;
          let done = false;

          const gen = {
            async next(): Promise<IteratorResult<any>> {
              // Once terminated, never resurrect and start the real generator.
              if (done) return { done: true, value: undefined };
              if (!realGenerator) {
                const service = await ensureLoading();
                if (service.serviceName !== undefined && service.serviceName !== 'lazy-service') {
                  lazyService.serviceName = `lazy-${service.serviceName}`;
                }
                realGenerator = (service as any)[key](...args);
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

    return lazyService as ServiceType;
  }) as any;
}
