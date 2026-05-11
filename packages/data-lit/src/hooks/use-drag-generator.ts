// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Observe } from '@adobe/data/observe';
import { DragObserveProps, DragState, useDragObserve } from './use-drag-observe.js';
import { useEffect } from './use-effect.js';

/**
 * When a drag starts, invokes `callback` with an async generator that yields
 * {@link DragState} values until the drag ends or is cancelled. Built on
 * {@link useDragObserve}.
 *
 * The callback also receives the `PointerEvent` that triggered `'start'` —
 * i.e. the `pointermove` whose cumulative distance first exceeded
 * `minDragDistance`. Callers that need the initial `clientX` / `clientY`
 * synchronously (before any transaction runs or any Lit re-render has flushed)
 * can use this event without awaiting the generator.
 *
 * The generator pairs naturally with an ECS transaction that accepts an
 * `AsyncArgsProvider`: feed each yielded `DragState` into a transient envelope
 * by returning the desired transaction args from the generator, and the ECS
 * (and any attached sync transport) replicates each intermediate state to
 * peers. The transaction commits when the drag ends and is cancelled when the
 * drag is cancelled.
 */
export function useDragGenerator(
    props: DragObserveProps,
    dependencies: unknown[],
    callback: (drag: AsyncGenerator<DragState>, startEvent: PointerEvent) => void,
) {
    const dragObserve = useDragObserve(props, dependencies);

    useEffect(() => {
        return dragObserve(value => {
            if (value.type === 'start') {
                const generator = Observe.toAsyncGenerator(
                    dragObserve,
                    v => v.type === 'end' || v.type === 'cancel',
                );
                callback(generator, value.event!);
            }
        });
    }, dependencies);
}
