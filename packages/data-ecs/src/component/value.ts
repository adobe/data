import type { Name as TraitName } from "../trait/name.js";
import type { Name } from "./name.js";
import type { Types } from "./types.js";

/** Every component's value type, computed once so `Value` is a lookup. */
type ValueTypes = { readonly [K in Name]: Types[K] extends { readonly type: infer T } ? T : never };

/** The value type of component `K`. */
export type Value<K extends Name> = ValueTypes[K];

/** Components that declare trait `T`, with a value assignable to `V`. */
export type With<T extends TraitName, V = unknown> = { [K in Name]: Types[K] extends { readonly [P in T]: V } ? K : never }[Name];

/** Components whose value type is assignable to `V`, as `Where<Entity>` for entity references. */
export type Where<V> = { [K in Name]: [Value<K>] extends [V] ? K : never }[Name];

/** Components only rules add and remove. */
export type Derived = With<"derived">;

/** Components user code adds and removes: the only ones commands take. */
export type Essential = Exclude<Name, Derived>;
