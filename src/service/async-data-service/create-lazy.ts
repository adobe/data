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
// DESCRIPTOR TYPE
// ============================================================================

type LazyServiceDescriptor<T extends Service, Args = void> = {
  // Loader function - may accept optional constructor args
  load: Args extends void 
    ? () => Promise<T> 
    : (args: Args) => Promise<T>;
  
  // Must describe every property (excluding base Service properties)
  properties: {
    [K in Exclude<keyof T, keyof Service>]: PropertyDescriptor<T[K]>;
  };
};

// ============================================================================
// MAIN FUNCTION SIGNATURE
// ============================================================================

/**
 * Creates a lazy-loading wrapper around an AsyncDataService.
 * The real service is only loaded when the first property is accessed.
 * All calls are queued and executed in order once the service loads.
 * 
 * @template T - The service interface type
 * @template Args - Optional constructor arguments type
 * 
 * @param descriptor - Complete description of service properties and loading behavior
 * @returns A lazy service with the same interface as T
 * 
 * TypeScript will enforce:
 * - All service properties must be declared in descriptor.properties
 * - Each descriptor must match the actual property type
 * - Clear errors indicate what is missing or wrong
 * 
 * @example
 * ```typescript
 * interface MyService extends Service {
 *   data: Observe<string>;
 *   fetch: (id: string) => Promise<Data>;
 * }
 * 
 * const lazy = createLazy<MyService>({
 *   load: () => import('./my-service').then(m => m.createService()),
 *   properties: {
 *     data: 'observe',
 *     fetch: 'fn:promise'
 *   }
 * });
 * ```
 */
export declare function createLazy<
  T extends Service,
  Args = void
>(
  descriptor: LazyServiceDescriptor<T, Args>
): T;
