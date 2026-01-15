// © 2026 Adobe. MIT License. See /LICENSE for details.

import { blit } from "./blit.js";

/** Raw byte-copy from any view to any view. */
export function copyViewBytes(
    src: ArrayBufferView,
    dst: ArrayBufferView,
  ): number {
    const bytes = Math.min(src.byteLength, dst.byteLength);
  
    blit(
      src.buffer,
      dst.buffer,
      src.byteOffset,
      dst.byteOffset,
      bytes,
    );
  
    return bytes;
  }
  