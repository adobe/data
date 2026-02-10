// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Data } from '../../data.js';

export type SequentialActionResult<Args extends Data[]> = {
    update: (...args: Args) => SequentialActionResult<Args>;
    cancel: () => void;
    commit: () => void;
};

/**
 * A function that represents a transient, sequential series of actions that must end with a commit or cancel.
 * This is the only service action which can return a value other than void.
 * It is intended to be used for multiframe transactions.
 */
export type SequentialAction<Args extends Data[]> = (...args: Args) => SequentialActionResult<Args>;

/**
 * Executes a sequential action using an async iterable iterator that provides the arguments.
 * @param action - The action to execute.
 * @param argProvider - An async iterable iterator of arguments to pass to the action.
 */
export async function executeSequentialAction<Arg extends Data>(action: SequentialAction<[Arg]>, argProvider: AsyncIterableIterator<Arg>) {
    let sequence: SequentialActionResult<[Arg]> | undefined;
    try {
        //  get the next arguments from the arg provider
        for await (const arg of argProvider) {
            //  then write them into the multiframe transaction (persisting this set of updates into database)
            sequence = (sequence?.update ?? action)(arg);
        }
        //  everything succeeded, finalize this transaction.
        sequence?.commit();
    }
    catch (e) {
        //  cancel the sequence
        sequence?.cancel();
        //  allow the async iterable iterator to finalize and close any open resources
        argProvider.throw?.(e);
    }
}