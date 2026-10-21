/**
 * The instance type of the global constructor `Name`, or `never` where the loaded libraries don't declare it, so types
 * that name platform classes compile with or without the DOM and worker libraries.
 */
export type Instance<Name extends string, Scope = typeof globalThis> =
    Scope extends { readonly [K in Name]: { readonly prototype: infer P } } ? P : never;

/**
 * A value the platform can move to another thread without copying it, as `postMessage` does with a transfer list.
 * `MediaSourceHandle` is left out: the DOM library declares it empty, so every value would match it.
 */
export type Transferable<Scope = typeof globalThis> =
    | ArrayBuffer
    | Instance<"ImageBitmap", Scope>
    | Instance<"OffscreenCanvas", Scope>
    | Instance<"MessagePort", Scope>
    | Instance<"VideoFrame", Scope>
    | Instance<"AudioData", Scope>
    | Instance<"ReadableStream", Scope>
    | Instance<"WritableStream", Scope>
    | Instance<"TransformStream", Scope>
    | Instance<"RTCDataChannel", Scope>;

/** Whether every value of `T` but `null` and `undefined` is Transferable. */
export type IsTransferable<T, Scope = typeof globalThis> =
    [Exclude<T, null | undefined>] extends [never] ? false :
    [Exclude<T, null | undefined>] extends [Transferable<Scope>] ? true :
    false;

/** Whether `T`, but `null` and `undefined`, is a DOM `Node`: never where the DOM library isn't loaded. */
export type IsNode<T, Scope = typeof globalThis> =
    [Instance<"Node", Scope>] extends [never] ? false :
    [Exclude<T, null | undefined>] extends [never] ? false :
    [Exclude<T, null | undefined>] extends [Instance<"Node", Scope>] ? true :
    false;
