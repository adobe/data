// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Observe } from "../../observe/index.js";
import { Service } from "../service.js";

// ============================================================================
// PROPERTY DESCRIPTORS
// ============================================================================

type PropertyDescriptor<P> =
  P extends Observe<any>
    ? 'observe'
    : P extends (...args: any[]) => Observe<any>
      ? 'fn:observe'
      : P extends (...args: any[]) => AsyncGenerator<any>
        ? 'fn:generator'
        : P extends (...args: any[]) => Promise<any>
          ? 'fn:promise'
          : P extends (...args: any[]) => void
            ? 'fn:void'
            : never;

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

// ============================================================================
// MAIN FUNCTION SIGNATURE
// ============================================================================

/**
 * Creates a lazy-loading wrapper factory for an AsyncDataService.
 * The real service is only loaded when the first property is accessed.
 * All calls are queued and executed in order once the service loads.
 * 
 * @param load - Function that loads and returns the real service (may accept args)
 * @param properties - Object describing how to wrap each service property
 * @returns A factory function that creates lazy service instances
 * 
 * TypeScript will enforce:
 * - All service properties must be declared in properties object
 * - Each descriptor must match the actual property type
 * - Clear errors indicate what is missing or wrong
 * 
 * @example
 * ```typescript
 * // Service with no args
 * const createLazySimple = createLazy(
 *   () => import('./simple').then(m => m.create()),
 *   { data: 'observe', fetch: 'fn:promise' }
 * );
 * const service = createLazySimple();
 * 
 * // Service with args
 * const createLazyConfig = createLazy(
 *   (config: Config) => import('./service').then(m => m.create(config)),
 *   { data: 'observe', fetch: 'fn:promise' }
 * );
 * const service = createLazyConfig({ apiUrl: '...' });
 * ```
 */
export function createLazy<
  LoadFn extends (...args: any[]) => Promise<Service>
>(
  load: LoadFn,
  properties: {
    [K in Exclude<keyof InferService<LoadFn>, keyof Service>]: 
      PropertyDescriptor<InferService<LoadFn>[K]>
  }
): InferArgs<LoadFn> extends void 
  ? () => InferService<LoadFn>
  : (args: InferArgs<LoadFn>) => InferService<LoadFn> {
  
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
    
    // Build lazy service object
    const lazyService: any = {
      serviceName: 'lazy-service',
    };
    
    // Wrap each property based on its descriptor
    for (const [key, descriptor] of Object.entries(properties)) {
      if (descriptor === 'observe') {
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
      } else if (descriptor === 'fn:promise') {
        // Promise function - queue calls and execute after load
        type QueuedCall = {
          args: any[];
          resolve: (value: any) => void;
          reject: (error: any) => void;
        };
        
        const queue: QueuedCall[] = [];
        let isProcessing = false;
        
        lazyService[key] = (...args: any[]): Promise<any> => {
          return new Promise((resolve, reject) => {
            queue.push({ args, resolve, reject });
            
            if (!isProcessing) {
              isProcessing = true;
              ensureLoading().then(async (service: any) => {
                if (service.serviceName !== 'lazy-service') {
                  lazyService.serviceName = `lazy-${service.serviceName}`;
                }
                // Execute all queued calls in order
                while (queue.length > 0) {
                  const call = queue.shift()!;
                  try {
                    const result = await service[key](...call.args);
                    call.resolve(result);
                  } catch (error) {
                    call.reject(error);
                  }
                }
              }).catch(error => {
                // Service load failed, reject all queued calls
                while (queue.length > 0) {
                  queue.shift()!.reject(error);
                }
              });
            }
          });
        };
      } else if (descriptor === 'fn:void') {
        // Void function - queue calls and execute after load
        const queue: any[][] = [];
        let isProcessing = false;
        
        lazyService[key] = (...args: any[]): void => {
          queue.push(args);
          
          if (!isProcessing) {
            isProcessing = true;
            ensureLoading().then((service: any) => {
              if (service.serviceName !== 'lazy-service') {
                lazyService.serviceName = `lazy-${service.serviceName}`;
              }
              // Execute all queued calls in order
              while (queue.length > 0) {
                const args = queue.shift()!;
                service[key](...args);
              }
            });
          }
        };
      } else if (descriptor === 'fn:observe') {
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
      } else if (descriptor === 'fn:generator') {
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
