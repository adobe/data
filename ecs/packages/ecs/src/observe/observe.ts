// © 2026 Adobe. MIT License. See /LICENSE for details.
/**
 * Observes a sequence of values: `notify` is called zero or more times, possibly during the call that subscribes,
 * possibly later; an observer mustn't depend on either. Returns the function that stops it.
 */
export type Observe<T> = (notify: (value: T) => void) => Unobserve;

/** Stops notifications; calling it again does nothing. */
type Unobserve = () => void;

/**
 * Observers of a world, built on observer systems: one per resource and per shape of observer, shared by every
 * subscriber of it, notifying once per run or tick whose sync point changed what it gives, and only then. - A first
 * value already held for that resource, entity or query, while others observe it, comes during the subscribing   call,
 * as of the last sync point. Any other comes later, from a run after every run called before the subscribing   call, so
 * it reflects them; first values of one task come in that order, from one batch of runs. A first value   whose notify
 * throws is thrown out of band, as an uncaught error, and stops that observer; a later value's is a   `"system"`
 * failure of the run or tick, named by the observer's system.
 * - Selections without `order`, and ties under one, come in entity order. Under `order`, NaN comes after every number.
 * - Values are kept warm for subscribers to come while their observers are used, and released once the world's
 *   passes found them unused in three; a query is kept current through an index only once a subscriber outlives its
 *   first value, so a first value alone is one scan.
 * - A disposed world runs nothing, so a first value that comes later never comes.
 */
export * as Observe from './members.js';
