// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Observe } from "@adobe/data/observe";
import { Vec2 } from "@adobe/data/math";
import { useElement } from "./use-element.js";
import { useEffect } from "./use-effect.js";
import { useMemo } from "./use-memo.js";

/**
 * Returns an `Observe<Vec2>` that fires on every `pointermove` over the host
 * element. Coordinates are relative to the element's bounding box, in pixels.
 *
 * This is the primitive for **continuous** pointer tracking — presence
 * indicators, live cursors, heat-maps, etc. It is intentionally simpler than
 * `useDragObserve`: it emits without a drag start/end lifecycle.
 *
 * ### Driving a never-ending presence transaction
 *
 * Pair with `Observe.toAsyncGenerator` to feed a never-ending async-generator
 * transaction. Each `yield` becomes an intermediate envelope that the sync
 * service forwards as `kind: "intermediate"`. The reconciler's `(userId, id)`
 * compound key replaces the previous sample, so each peer has at most one
 * outstanding cursor sample at any time.
 *
 * ```ts
 * const pointerPos = usePointerObserve([]);
 *
 * useEffect(() => {
 *   const positions = Observe.toAsyncGenerator(pointerPos, () => false);
 *
 *   async function* presenceArgs() {
 *     for await (const [px, py] of positions) {
 *       const { width, height } = element.getBoundingClientRect();
 *       if (!width || !height) continue;
 *       yield { userId, x: px / width, y: py / height };
 *     }
 *   }
 *
 *   // The wrapper returns a Promise when invoked with a generator factory.
 *   // It rejects when we `.throw()` on dispose; swallow that — we threw
 *   // precisely so the wrapper would cancel the in-flight transient
 *   // instead of promoting the last sample to a commit.
 *   db.transactions.movePresence(presenceArgs).catch(() => undefined);
 *
 *   return () => {
 *     void positions.throw(new Error("disposed")).catch(() => undefined);
 *   };
 * }, []);
 * ```
 *
 * ### Why `() => false` as the `finished` predicate?
 *
 * `Observe.toAsyncGenerator` stops when `finished(value)` returns `true`.
 * Passing `() => false` makes the generator run until `gen.throw()` (or
 * `gen.return()`) is called from the effect cleanup — the correct lifetime
 * for a presence stream.
 */
export function usePointerObserve(dependencies: unknown[]): Observe<Vec2> {
    // useMemo ensures the same [observe, notify] pair is reused across renders
    // as long as dependencies are stable — critical so subscribers registered
    // in a sibling useEffect don't miss events fired between renders.
    const [pos, setPos] = useMemo(
        () => Observe.createEvent<Vec2>(),
        dependencies,
    );

    const element = useElement();

    useEffect(() => {
        const handler = (e: PointerEvent) => {
            const rect = element.getBoundingClientRect();
            setPos([e.clientX - rect.left, e.clientY - rect.top]);
        };
        element.addEventListener("pointermove", handler);
        return () => element.removeEventListener("pointermove", handler);
    }, [element, setPos]);

    return pos;
}
