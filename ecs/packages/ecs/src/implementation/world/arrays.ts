// © 2026 Adobe. MIT License. See /LICENSE for details.
import { viewsOf, type Layout, type TypedArray, type Views } from '../../interface/registry/layout.js';
import type { Memory } from './memory.js';

export type ArrayConstructor<T> = {
    new(buffer: ArrayBufferLike, byteOffset: number, length: number): T;
    readonly BYTES_PER_ELEMENT: number;
};

type View = { readonly byteOffset: number; readonly byteLength: number };

/** A typed array over a new arena block. Contents are unspecified. */
export const allocateArray = <T>(memory: Memory, constructor: ArrayConstructor<T>, length: number): T => {
    if (!memory.shared) return new constructor(new ArrayBuffer(length * constructor.BYTES_PER_ELEMENT), 0, length);
    // Allocate first: it may grow memory, which replaces `memory.buffer`.
    const offset = memory.allocate(length * constructor.BYTES_PER_ELEMENT);
    return new constructor(memory.memory.buffer, offset, length);
};

export const freeArray = (memory: Memory, array: View): void => {
    if (memory.shared) memory.free(array.byteOffset, array.byteLength);
};

/** Moves the first `used` elements into a new block of `length` and frees the old one. */
export const growArray = <T extends View & { set(source: ArrayLike<number>): void; subarray(start: number, end: number): ArrayLike<number> }>(
    memory: Memory, array: T, constructor: ArrayConstructor<T>, length: number, used: number,
): T => {
    const grown = allocateArray(memory, constructor, length);
    grown.set(array.subarray(0, used));
    freeArray(memory, array);
    return grown;
};

/** Views of a new arena block of `bytes`, for one component's interleaved column. Contents are unspecified. */
export const allocateViews = (memory: Memory, bytes: number): Views => {
    if (!memory.shared) return viewsOf(new ArrayBuffer(bytes), 0, bytes);
    const offset = memory.allocate(bytes);
    return viewsOf(memory.memory.buffer, offset, bytes);
};

export const freeViews = (memory: Memory, views: Views): void => freeArray(memory, views.u8);

/** Views of no bytes, for components with nothing to store. */
export const emptyViews: Views = viewsOf(new ArrayBuffer(0), 0, 0);

/** A kernel's column of a component an archetype lacks, optional in its system: empty, so its reads give undefined. */
export const absentColumn = (layout: Layout, source: { readonly kind: string; readonly leaf?: number }): TypedArray =>
    source.kind === "field" && layout.kind === "linear" && source.leaf !== undefined ? emptyViews[layout.leaves[source.leaf].view] : emptyViews.f64;
