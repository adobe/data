// © 2026 Adobe. MIT License. See /LICENSE for details.

/** What waits for the next tick, resolved by the system `watchTicks` adds. */
export const waiting: (() => void)[] = [];
