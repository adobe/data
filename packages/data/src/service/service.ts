// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Schema } from "../schema/index.js";

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
 * a factory may also attach it to the instance via the optional `schema` slot for
 * runtime introspection. Both `serviceName` and `schema` are base-`Service`
 * metadata, so they are excluded from `AsyncDataService.IsValid` and reserved as
 * member names. See `async-data-service/is-valid-with-*-schema.ts`.
 */
export interface Service {
  readonly serviceName?: string;
  /** Optional runtime copy of the service's schema (its authored contract). */
  readonly schema?: Schema;
}
