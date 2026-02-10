// © 2026 Adobe. MIT License. See /LICENSE for details.
import { equals } from "../equals.js";
import { ReadonlyTypedBuffer } from "./typed-buffer.js";

export function typedBufferEquals(
    a: ReadonlyTypedBuffer<unknown>,
    b: ReadonlyTypedBuffer<unknown>
): boolean {
    if (a === b) return true;                        // same reference

    // cheap structural checks first
    if (a.type !== b.type ||
        a.capacity !== b.capacity) return false;

    // compare schemas using equals function
    if (!equals(a.schema, b.schema)) return false;

    // fallback: per-element recursive compare
    const capacity = a.capacity;
    for (let i = 0; i < capacity; i++) {
        if (!equals(a.get(i), b.get(i))) return false;
    }
    return true;
}
