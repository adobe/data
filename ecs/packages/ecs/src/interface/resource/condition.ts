// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Key } from "./key.js";
import type { Type } from './value.js';

/** The resources a system can run on the condition of: their type allows `null` or `false`. */
export type Condition = { [K in Key]: null extends Type<K> ? K : false extends Type<K> ? K : never }[Key];

/** A condition's value while `is` holds: neither `null` nor `false`. */
export type Holding<K extends Key> = Exclude<Type<K>, null | false>;
