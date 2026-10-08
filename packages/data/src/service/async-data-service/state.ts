// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Observe } from "../../observe/index.js";
import { Service } from "../service.js";

// A member's state value: an `Observe<T>` becomes `T`, a nested organizational group
// becomes its own `State` (dropped when it holds no observe members), and anything
// else (an action) is `never`, which removes the key.
type StateValue<P> =
  P extends Observe<infer T> ? T
  : P extends (...args: any[]) => any ? never
  : P extends object ? (keyof State<P> extends never ? never : State<P>)
  : never;

/**
 * The current-value snapshot of a service: the same nested shape as `T`, keeping only
 * its `Observe<X>` members (converted to `X`) and the groups that contain them. Actions
 * and base-`Service` metadata are omitted. Produced at runtime by `toObserveState`.
 */
export type State<T> = {
  readonly [K in keyof T as K extends keyof Service ? never
    : [StateValue<Exclude<T[K], undefined>>] extends [never] ? never
    : K]: StateValue<Exclude<T[K], undefined>>;
};
