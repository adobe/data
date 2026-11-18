// © 2026 Adobe. MIT License. See /LICENSE for details.
import { nextTick } from "./function.next-tick.js";

/** Waits for a run, then for the tick after it. */
export const settled = async <T>(run: Promise<T>): Promise<T> => {
    const ran = await run;
    await nextTick();
    return ran;
};
