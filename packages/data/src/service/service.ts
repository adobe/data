// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Schema } from "../schema/index.js";
import type { Observe } from "../observe/index.js";

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
 *
 * A service's shape can be described by a `Schema` (an object schema whose
 * property schemas describe each member). The schema is authored beside the
 * service (e.g. `MyService.schema`) and validated with `IsValidWithCompleteSchema`;
 * a factory may also expose it at runtime via the optional `schema` slot for
 * introspection. It is `Observe<Schema>` — observable — because a service's
 * discoverable interface can change at runtime (e.g. once an iframe-projected
 * service loads and reveals a different surface). Both `serviceName` and `schema`
 * are base-`Service` metadata, so they are excluded from `AsyncDataService.IsValid`
 * (which is why `schema` need not be `Data`) and reserved as member names.
 * See `async-data-service/is-valid-with-*-schema.ts`.
 */
export interface Service {
  readonly serviceName?: string;
  /** Optional observable of the service's schema (its authored contract), which
   *  may change at runtime as the service's discoverable interface evolves. */
  readonly schema?: Observe<Schema>;
}
