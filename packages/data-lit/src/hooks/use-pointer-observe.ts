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
 * ### Driving a never-ending presence loop
 *
 * Pair with `Observe.toAsyncGenerator` to get an async generator that streams
 * positions for the component's lifetime and feeds a transient transaction:
 *
 * ```ts
 * const pointerPos = usePointerObserve([]);
 *
 * useEffect(() => {
 *   const gen = Observe.toAsyncGenerator(pointerPos, () => false);
 *   let active = true;
 *   (async () => {
 *     for await (const [px, py] of gen) {
 *       if (!active) break;
 *       syncClient.sendTransient({
 *         id: PRESENCE_ID,
 *         name: "movePresence",
 *         args: { userId, x: px, y: py },
 *         time: -1,
 *       });
 *     }
 *   })();
 *   return () => {
 *     active = false;
 *     gen.return(undefined as any);
 *   };
 * }, []);
 * ```
 *
 * ### Why `() => false` as the `finished` predicate?
 *
 * `Observe.toAsyncGenerator` stops when `finished(value)` returns `true`.
 * Passing `() => false` makes the generator run until `gen.return()` is
 * called (e.g. on component disconnect), which is the correct lifetime for
 * a presence stream.
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
