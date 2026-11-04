// © 2026 Adobe. MIT License. See /LICENSE for details.

import { DragEnd, DragMove, DragObserveProps, DragState, useDragObserve } from './use-drag-observe.js';
import { useEffect } from "./use-effect.js";
import type { AsyncArgsProvider } from '@adobe/data/ecs';
import { Observe } from '@adobe/data/observe';

export type DragTransactionProps<T extends {} | null> = DragObserveProps & {
    transaction: (asyncArgs: AsyncArgsProvider<T>) => void;
    update: (drag: DragMove | DragEnd) => T | void;
};

// Thrown into a drag's argument generator so the transaction discards its transient state.
const dragCancelled = new Error('Drag cancelled');

async function* toTransactionArgs<T extends {} | null>(
    drags: AsyncGenerator<DragState>,
    update: DragTransactionProps<T>['update'],
): AsyncGenerator<T> {
    for await (const drag of drags) {
        if (drag.type === 'move' || drag.type === 'end') {
            const args = update(drag);
            if (args !== undefined) {
                yield args;
            }
        }
    }
}

/**
 * Drives `transaction` with one argument generator per drag: each move or end
 * yields `update(drag)` as intermediate arguments, the end commits the last
 * arguments, and a cancellation (including unmount mid-drag) discards them.
 */
export function useDragTransaction<T extends {} | null>(props: DragTransactionProps<T>, dependencies: unknown[]) {
    const dragObserve = useDragObserve(props, dependencies);
    useEffect(() => {
        const { transaction, update } = props;
        let active: AsyncGenerator<DragState> | undefined;
        const cancel = () => {
            const drags = active;
            active = undefined;
            drags?.throw(dragCancelled).catch(() => undefined);
        };
        const unobserve = dragObserve(value => {
            if (value.type === 'start') {
                cancel();
                const drags = active = Observe.toAsyncGenerator(
                    dragObserve,
                    v => v.type === 'end' || v.type === 'cancel',
                );
                const result: unknown = transaction(() => toTransactionArgs(drags, update));
                Promise.resolve(result).catch(error => {
                    if (error !== dragCancelled) throw error;
                });
            } else if (value.type === 'end') {
                active = undefined;
            } else if (value.type === 'cancel') {
                cancel();
            }
        });
        return () => {
            unobserve();
            cancel();
        };
    }, dependencies);
}
