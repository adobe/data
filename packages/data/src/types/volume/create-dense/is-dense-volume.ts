// © 2026 Adobe. MIT License. See /LICENSE for details.

import { DenseVolume } from "./dense-volume.js";

export const isDenseVolume = (value: unknown): value is DenseVolume<unknown> =>
    value instanceof DenseVolume;
