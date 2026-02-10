// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * An Observe type is a function that can be called to observe a sequence of values.
 * The Observe function is called with a Callback function that may be called zero or more times.
 * The Observe function returns an Unobserve function that can be called to stop observing the Observe function.
 */
export type Observe<T> = (notify: Notify<T>) => Unobserve;

/**
 * Callback function called zero or more times with a sequence of values.
 * *may* be called back synchronously, immediately when selector function is called.
 * *may* also be called back later asynchronously any number of times.
 * *may* be called multiple sequential times with the same value.
 */
export type Notify<T> = (value: T) => void;

/**
 * Function called to stop observing an Observe function.
 */
export type Unobserve = () => void;

export * as Observe from "./public.js";