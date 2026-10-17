type Method = (...parameters: never[]) => unknown;

/** True for a value that isn't data: a function, or an object with a method. Only an object's own members are looked at. */
type NotData<T> =
    T extends string | number | boolean | bigint | symbol | null | undefined ? false :
    T extends Method ? true :
    T extends readonly (infer E)[] ? NotData<E> :
    T extends object ? (true extends { [K in keyof T]-?: T[K] extends Method ? true : false }[keyof T] ? true : false) :
    false;

/**
 * Whether a declared type is data a schema describes. A `Blob`, an `HTMLElement` or a `GPUDevice` isn't: its
 * declaration leaves `type` out, and the world stores the value as it is.
 */
export type IsData<T> = true extends NotData<T> ? false : true;
