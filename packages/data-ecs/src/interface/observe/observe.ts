/**
 * Observes a sequence of values: `notify` is called zero or more times, possibly during the call that subscribes, possibly
 * later; an observer mustn't depend on either. Returns the function that stops it.
 */
export type Observe<T> = (notify: (value: T) => void) => Unobserve;

/** Stops notifications; calling it again does nothing. */
type Unobserve = () => void;

export * as Observe from './index.js';
