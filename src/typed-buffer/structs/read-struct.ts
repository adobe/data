// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { DataView32 } from "../../internal/data-view-32/data-view-32.js";

export type ReadStruct<T> = (data: DataView32, index: number) => T;

