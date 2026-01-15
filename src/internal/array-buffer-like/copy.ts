// © 2026 Adobe. MIT License. See /LICENSE for details.
export const copy = (from: ArrayBufferLike, to: ArrayBufferLike, length = from.byteLength, fromOffset = 0, toOffset = 0): void => {
    if (length > from.byteLength) {
        throw new Error("Cannot copy more than the source");
    }
    if (fromOffset < 0) {
        throw new Error("Cannot copy from a negative offset");
    }
    if (toOffset < 0) {
        throw new Error("Cannot copy to a negative offset");
    }
    if (fromOffset + length > from.byteLength) {
        throw new Error("Cannot copy more than the source");
    }
    if (toOffset + length > to.byteLength) {
        throw new Error("Cannot copy more than the destination");
    }
    if (from === to) {
        // potential overlap, so use copyWithin
        const array = new Uint8Array(from);
        array.copyWithin(toOffset, fromOffset, fromOffset + length);
    }
    else {
        const fromArray = new Uint8Array(from).subarray(fromOffset, fromOffset + length);
        const toArray = new Uint8Array(to).subarray(toOffset, toOffset + length);
        toArray.set(fromArray);
    }
}
