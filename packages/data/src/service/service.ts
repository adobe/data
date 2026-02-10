// © 2026 Adobe. MIT License. See /LICENSE for details.

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
  readonly serviceName: string;
}
