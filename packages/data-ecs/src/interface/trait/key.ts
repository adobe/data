import type { Traits } from './types.js';

export type Key = keyof Traits<never, never>;

/** The core's traits, the only ones named by strings. */
export type BuiltIn = "type" | "derived" | "within" | "reference" | "reduce" | "thread" | "transfer";
