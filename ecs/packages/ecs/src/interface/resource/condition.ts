// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Key } from "./key.js";
import type { Value } from './value.js';

/** The resources a system can run on the condition of: their type allows `null` or `false`. */
export type Condition = { [K in Key]: null extends Value<K> ? K : false extends Value<K> ? K : never }[Key];

/** A condition's value while `is` holds: neither `null` nor `false`. */
export type Holding<K extends Key> = Exclude<Value<K>, null | false>;
