// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * A provider of deferred or streamed arguments. Calling it yields the real
 * argument value either once (a `Promise`) or repeatedly over time (an
 * `AsyncGenerator`).
 *
 * Two layers reason about this shape:
 * - Transaction dispatch exposes an overload accepting one, so a single
 *   logical mutation can be driven by a live source (a drag, a slider, a
 *   stream) and committed once when the source settles.
 * - The UIService restriction preserves that calling convention (while
 *   rewriting the return to `void`) so UI consumers can drive such a
 *   transaction without ever awaiting it.
 *
 * This lives in the shared `types` kernel because both the `ecs` and
 * `service` layers depend on it, and neither should depend on the other.
 */
export type AsyncArgsProvider<T> = () => Promise<T> | AsyncGenerator<T>;
