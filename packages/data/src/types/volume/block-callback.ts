// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { TypedBuffer } from "../../typed-buffer/index.js";
import type { BlockSpan } from "./block-span.js";

/**
 * Called once per block, in stable implementation-defined order.
 *
 * Voxels are in standard dense layout: local `(lx, ly, lz)` is at
 * `block.offset + getDenseIndex(block.size, lx, ly, lz)`.
 */
export type BlockCallback<T> = (
    buffer: TypedBuffer<T>,
    block: BlockSpan,
    done: boolean,
) => void;
