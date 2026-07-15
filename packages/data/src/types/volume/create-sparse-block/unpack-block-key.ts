// © 2026 Adobe. MIT License. See /LICENSE for details.

import { decodeBlockKeyInline } from "./block-key.js";

export const unpackBlockKey = (key: number): { readonly bx: number; readonly by: number; readonly bz: number } => {
    const [bx, by, bz] = decodeBlockKeyInline(key);
    return { bx, by, bz };
};
