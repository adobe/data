// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Lane } from "../data/values/lane/lane.js";
import type { State } from "./state.js";

// Two 5-wide, 3-tall boards differing only in the middle lane's terrain, shared by the
// system and frame cases.
export const roadLanes: readonly Lane[] = [
  { row: 0, kind: "grass" },
  { row: 1, kind: "road" },
  { row: 2, kind: "goal" },
];
export const riverLanes: readonly Lane[] = [
  { row: 0, kind: "grass" },
  { row: 1, kind: "river" },
  { row: 2, kind: "goal" },
];

// A full in-play state on the road board, frog resting on grass, no hazards.
export const board = (overrides: Partial<State>): State => ({
  width: 5,
  height: 3,
  lanes: roadLanes,
  entities: new Map(),
  frog: { x: 2, y: 0 },
  lives: 3,
  score: 0,
  status: "playing",
  ...overrides,
});
