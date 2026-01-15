// © 2026 Adobe. MIT License. See /LICENSE for details.

import { DragEnd, DragMove, DragObserveProps, useDragObserve } from './use-drag-observe.js';
import { useEffect } from "./use-effect.js";
import type { AsyncArgsProvider } from '../../ecs/store/transaction-functions.js';
import { Observe } from '../../observe/index.js';

export type DragTransactionProps<T> = DragObserveProps & {
    transaction: (asyncArgs: AsyncArgsProvider<T>) => void;
    update: (drag: DragMove | DragEnd) => T | void;
};

export function useDragTransaction<T>(props: DragTransactionProps<T>, dependencies: unknown[]) {
    const { transaction, update } = props;
    const dragObserve = useDragObserve(props, dependencies);
    const startDragTransaction = () => {
        let done = false;
        // we start the transaction by calling it with an async generator that will yield the args asynchronously
        transaction(
            // we create the async generator by mapping the dragObserve state changes to transaction args
            () =>
                Observe.toAsyncGenerator(
                    // this uses the withMap function and the provided update and finish functions
                    // any type 'start' will just be ignored and filtered out
                    Observe.withFilter(dragObserve, value => {
                        if (value.type === 'end') {
                            done = true;
                            return update(value);
                        }
                        if (value.type === 'move') {
                            return update(value);
                        }
                    }),
                    _value => done
                )
        );
    };
    // now we will observe the drag state and start a new transaction whenever a drag starts
    useEffect(() => {
        return dragObserve(value => {
            if (value.type === 'start') {
                startDragTransaction();
            }
        });
    }, dependencies);
}
