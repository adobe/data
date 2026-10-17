/**
 * Observes a sequence of values: `notify` is called after each run that changes what's observed, never during the
 * call that subscribes. Returns the function that stops it. The same shape as `@adobe/data`'s `Observe`.
 */
export type Observe<T> = (notify: (value: T) => void) => Unobserve;

/** Stops notifications; calling it again does nothing. */
type Unobserve = () => void;
