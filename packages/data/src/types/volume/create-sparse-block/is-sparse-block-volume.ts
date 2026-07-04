// © 2026 Adobe. MIT License. See /LICENSE for details.

import { SparseBlockVolume } from "./sparse-block-volume.js";

export const isSparseBlockVolume = (value: unknown): value is SparseBlockVolume<unknown> =>
    value instanceof SparseBlockVolume;
