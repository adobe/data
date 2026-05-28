// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Guid } from "./index.js";

// RFC 4122 v4: version nibble (bits 48-51) = 4, variant (bits 64-65) = 10
export const create = (): Guid => {
    const arr = new Uint32Array(4);
    crypto.getRandomValues(arr);
    arr[1] = (arr[1] & 0xFFFF0FFF) | 0x00004000;
    arr[2] = (arr[2] & 0x3FFFFFFF) | 0x80000000;
    return [arr[0], arr[1], arr[2], arr[3]];
};
