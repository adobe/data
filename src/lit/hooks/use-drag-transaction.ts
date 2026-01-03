/*MIT License

© Copyright 2025 Adobe. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.*/

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
