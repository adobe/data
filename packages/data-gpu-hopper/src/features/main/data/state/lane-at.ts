// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import type { Lane } from "../lane/lane.js";

// The lane (terrain) occupying `row`, if any.
export const laneAt = <T extends Pick<State, "lanes">>(state: T, row: number): Lane | undefined =>
  state.lanes.find((lane) => lane.row === row);
