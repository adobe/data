// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { LaneKind } from "../lane-kind/lane-kind.js";

// One board row: its row index and terrain.
export type Lane = { readonly row: number; readonly kind: LaneKind };
export * as Lane from "./public.js";
