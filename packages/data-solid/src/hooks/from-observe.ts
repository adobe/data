// © 2026 Adobe. MIT License. See /LICENSE for details.

import { from, type Accessor } from "solid-js";
import type { Observe } from "@adobe/data/observe";

/**
 * Bridges an @adobe/data Observe<T> to a Solid accessor.
 *
 * Without a default the accessor yields T | undefined (the observable may not
 * have emitted yet).  With a default value of type D the return type becomes
 * Accessor<T | D> — which collapses to Accessor<T> when D is a subtype of T.
 */
export function fromObserve<T, const D = undefined>(
  observe: Observe<T>,
  ...args: [defaultValue: D] | []
): Accessor<T | D> {
  const accessor = from<T | undefined>(observe);
  if (args.length) {
    const fallback = args[0];
    return (() => accessor() ?? fallback) as Accessor<T | D>;
  }
  return accessor as Accessor<T | D>;
}
