/**
 * Observes a sequence of values: `notify` gets the current value soon after subscribing, never during that call,
 * then the value after each run that changes it. Returns the function that stops it. The same shape as `@adobe/data`'s
 * `Observe`.
 */
export type Observe<T> = (notify: (value: T) => void) => Unobserve;

/** Stops notifications; calling it again does nothing. */
type Unobserve = () => void;
