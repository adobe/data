// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Observe } from "../../observe/index.js";
import { Schema } from "../../schema/index.js";
import { Service } from "../service.js";
import { IsValidWithCompleteSchema } from "./is-valid-with-complete-schema.js";

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

// Surfaced on the `schema` argument when it does not completely and correctly
// describe the loaded service, so the mismatch is caught at the call site.
type SchemaMismatch = {
  readonly __createLazyError: "createLazy: schema must completely and correctly describe the loaded service";
};

// ============================================================================
// RUNTIME WRAPPER KIND
// ============================================================================

type WrapKind = "observe" | "fn:observe" | "fn:promise" | "fn:generator" | "fn:void";

// The runtime wrapper strategy for a service member, derived from its schema:
// an `observe` value, or a `function` classified by what it returns.
function memberKind(member: Schema): WrapKind {
  if (member.type === "observe") return "observe";
  if (member.type === "function") {
    switch (member.returns?.type) {
      case "observe": return "fn:observe";
      case "promise": return "fn:promise";
      case "generator": return "fn:generator";
      default: return "fn:void"; // absent returns ⇒ void
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
 * TypeScript enforces that `schema` completely and correctly describes the loaded
 * service; otherwise the `schema` argument reports a {@link SchemaMismatch}.
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
  const S extends Schema
>(
  params: {
    load: LoadFn,
    schema: S,
    preload?: boolean
  } & (IsValidWithCompleteSchema<InferService<LoadFn>, S> extends true
    ? unknown
    : { schema: SchemaMismatch })
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

    // Build lazy service object
    const lazyService: any = {
      serviceName: 'lazy-service',
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
            if (!isCancelled && service.serviceName !== 'lazy-service') {
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
                  if (service.serviceName !== 'lazy-service') {
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
              if (service.serviceName !== 'lazy-service') {
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
              if (service.serviceName !== 'lazy-service') {
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

          return {
            async next(): Promise<IteratorResult<any>> {
              if (!realGenerator) {
                const service = await ensureLoading();
                if (service.serviceName !== 'lazy-service') {
                  lazyService.serviceName = `lazy-${service.serviceName}`;
                }
                realGenerator = (service as any)[key](...args);
              }
              return realGenerator!.next();
            },

            async return(value?: any): Promise<IteratorResult<any>> {
              if (realGenerator) {
                return realGenerator.return(value);
              }
              return { done: true, value: value as any };
            },

            async throw(e: any): Promise<IteratorResult<any>> {
              if (realGenerator) {
                return realGenerator.throw(e);
              }
              throw e;
            },

            [Symbol.asyncIterator]() {
              return this;
            }
          } as AsyncGenerator<any>;
        };
      }
    }

    return lazyService as ServiceType;
  }) as any;
}
