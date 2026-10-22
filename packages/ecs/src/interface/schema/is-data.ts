// © 2026 Adobe. MIT License. See /LICENSE for details.
type Method = (...parameters: never[]) => unknown;

/** How deep `NotData` looks into members: deeper ones count as data, so recursive types stay finite. */
type Depth = [never, 0, 1, 2, 3, 4];

/**
 * True for a value that isn't data: a function, an object with a member that isn't data, or a `Set` or `Map`, which
 * changes in place. A `ReadonlySet` or `ReadonlyMap` is data when what it holds is. Members are looked at five levels
 * deep.
 */
type NotData<T, D extends number = 5> =
    [D] extends [never] ? false :
    T extends string | number | boolean | bigint | symbol | null | undefined ? false :
    T extends Method ? true :
    T extends readonly (infer E)[] ? NotData<E, Depth[D]> :
    T extends ReadonlyMap<infer K, infer V> ? (T extends Map<K, V> ? true : NotData<K, Depth[D]> | NotData<V, Depth[D]>) :
    T extends ReadonlySet<infer E> ? (T extends Set<E> ? true : NotData<E, Depth[D]>) :
    T extends object ? (true extends { [K in keyof T]-?: NotData<T[K], Depth[D]> }[keyof T] ? true : false) :
    false;

/**
 * Whether a declared type is data a schema describes, so its registration gives that schema. A `Blob`, an
 * `HTMLElement` or a `GPUDevice` isn't: its registration has no `type`, and the world stores the value as it is.
 */
export type IsData<T> = true extends NotData<T> ? false : true;
