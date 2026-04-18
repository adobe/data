// © 2026 Adobe. MIT License. See /LICENSE for details.

import { from, type Accessor } from "solid-js";
import type { Observe } from "@adobe/data/observe";

/**
 * Bridges an @adobe/data Observe<T> to a Solid accessor (signal).
 *
 * Solid's `from()` works at runtime with Observe<T> directly, but TypeScript
 * cannot infer T through the complex Setter<T> overloads in Producer<T>.
 * This function provides correct type inference by forwarding the generic.
 */
export function fromObserve<T>(observe: Observe<T>): Accessor<T | undefined> {
  return from<T | undefined>(observe);
}
