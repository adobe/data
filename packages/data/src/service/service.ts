// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Schema } from "../schema/index.js";
import type { DescriptorToService } from "./descriptor-to-service.js";

/**
 * A service is an object that provides functionality to an application.
 * Services are never dependent upon user interface components.
 * Services come in several varieties:
 * - Frontend Services
 *   - Only contain void actions and observe functions.
 *   - Async nature enforces unidirectional control flow and decouples the service from the UI.
 * - Backend Services
 *   - Usually consumed by other services.
 *   - May also contain Promise<Data> or AsyncGenerator<Data> functions.
 */
export interface Service {
  readonly serviceName?: string;
  /**
   * Optional, purely declarative description of this service's surface.
   * Lives in the base `Service` so it is excluded from `AsyncDataService`
   * validation — a plain-data constant that can be serialized and published.
   */
  readonly descriptor?: Service.Descriptor;
}

export namespace Service {
  /**
   * A JSON-serializable description of a service: its observable states, its
   * actions, and any child services it exposes. Mirrors the shapes an
   * `AsyncDataService` is allowed to contain.
   */
  export interface Descriptor {
    readonly description: string;
    readonly states: { readonly [name: string]: Descriptor.StateDescriptor };
    readonly actions: { readonly [name: string]: Descriptor.ActionDescriptor };
    readonly services: { readonly [name: string]: Descriptor };
  }

  export namespace Descriptor {
    /**
     * Converts a statically-typed `Descriptor` into the `Service` type it
     * describes — the compile-time bridge used to verify a descriptor matches
     * its associated service.
     */
    export type ToService<D extends Descriptor> = DescriptorToService<D>;

    /**
     * A readable observable value. Direct (`foo: Observe`) when `parameters`
     * is absent; an observe factory (`bar(args): Observe`) when present.
     */
    export interface StateDescriptor {
      readonly schema: Schema;
      readonly parameters?: readonly Schema[];
      readonly description: string;
    }

    /** A callable invoked for its effect or async result. */
    export interface ActionDescriptor {
      readonly parameters: readonly Schema[];
      readonly result: "promise" | "generator" | "void";
      /** Schema of the resolved/yielded value; absent when result is "void". */
      readonly returns?: Schema;
      readonly description: string;
    }
  }
}
