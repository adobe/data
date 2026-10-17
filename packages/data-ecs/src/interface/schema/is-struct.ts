type Method = (...parameters: never[]) => unknown;

/** Whether an object type has a method of its own, so it isn't data, looked at without recursing. */
type HasMethod<T> = true extends { [K in keyof T]-?: T[K] extends Method ? true : false }[keyof T] ? true : false;

/**
 * Whether a value is a struct: numbers, booleans, entities, fixed-length tuples and structs of those, so its schema has
 * a fixed size. A struct lives in shared memory, where every thread reads it. Any other value is an object, which lives
 * on one logical thread's heap, strings and variable-length arrays included.
 */
export type IsStruct<T> =
    [T] extends [number | boolean] ? true :
    [T] extends [Method] ? false :
    [T] extends [readonly unknown[]] ? (number extends T["length"] ? false : IsStruct<T[number]>) :
    [T] extends [object] ? (HasMethod<T> extends true ? false : false extends { [K in keyof T]-?: IsStruct<T[K]> }[keyof T] ? false : true) :
    false;
