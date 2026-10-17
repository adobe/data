import type { Name } from './name.js';
import type { Value } from './value.js';

/** The resources a system can run on the condition of: their type allows `null` or `false`. */
export type Condition = { [K in Name]: null extends Value<K> ? K : false extends Value<K> ? K : never }[Name];

/** A condition's value while `is` holds: neither `null` nor `false`. */
export type Holding<K extends Name> = Exclude<Value<K>, null | false>;
