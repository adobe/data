// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Lane } from "../lane/lane.js";
import type { HazardKind } from "../hazard-kind/hazard-kind.js";

// A board to play: its size, the terrain per row, the starting hazards and lives.
export type Level = {
  readonly width: number;
  readonly height: number;
  readonly lanes: readonly Lane[];
  readonly hazards: readonly {
    readonly kind: HazardKind;
    readonly lane: number;
    readonly x: number;
    readonly width: number;
    readonly velocity: number;
  }[];
  readonly lives: number;
};
export * as Level from "./public.js";
