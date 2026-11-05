// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { LoadParser } from '../syntax.js';

/** Loads the parser on the first call and gives that one to every later call, loading again after a load that failed. */
export const once = (load: LoadParser): LoadParser => {
    let loading: ReturnType<LoadParser> | undefined;
    return () => loading ??= load().catch((error: unknown) => {
        loading = undefined;
        throw error;
    });
};
