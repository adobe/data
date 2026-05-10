// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Observe } from "@adobe/data/observe";
import { useElement } from "./use-element.js";
import { useEffect } from "./use-effect.js";
import { useMemo } from "./use-memo.js";

export type PointerPosition = { readonly x: number; readonly y: number };

/**
 * Returns an `Observe<PointerPosition>` that fires on every `pointermove`
 * over the host element. Coordinates are relative to the element's bounding
 * box, in pixels.
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
 *     for await (const { x, y } of gen) {
 *       if (!active) break;
 *       syncClient.sendTransient({
 *         id: PRESENCE_ID,
 *         name: "movePresence",
 *         args: { userId, x, y },
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
export function usePointerObserve(dependencies: unknown[]): Observe<PointerPosition> {
    // useMemo ensures the same [observe, notify] pair is reused across renders
    // as long as dependencies are stable — critical so subscribers registered
    // in a sibling useEffect don't miss events fired between renders.
    const [pos, setPos] = useMemo(
        () => Observe.createEvent<PointerPosition>(),
        dependencies,
    );

    const element = useElement();

    useEffect(() => {
        const handler = (e: PointerEvent) => {
            const rect = element.getBoundingClientRect();
            setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        };
        element.addEventListener("pointermove", handler);
        return () => element.removeEventListener("pointermove", handler);
    }, [element, setPos]);

    return pos;
}
