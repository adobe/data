// © 2026 Adobe. MIT License. See /LICENSE for details.

/** Stops every one of `stops`, as one. */
export const all = (...stops: readonly (() => void)[]): (() => void) => () => {
    for (const stop of stops) stop();
};
