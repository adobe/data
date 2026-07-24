// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import type { Lane } from "../lane/lane.js";
import type { Hazard } from "../hazard/hazard.js";
import { startPosition } from "./start-position.js";

const width = 9;
const height = 9;

// Terrain per row, bottom (0, the start) to top (8, the goal): a grass start,
// three car lanes, a grass median, three log lanes, then the goal.
const lanes: readonly Lane[] = [
  { row: 0, kind: "grass" },
  { row: 1, kind: "road" },
  { row: 2, kind: "road" },
  { row: 3, kind: "road" },
  { row: 4, kind: "grass" },
  { row: 5, kind: "river" },
  { row: 6, kind: "river" },
  { row: 7, kind: "river" },
  { row: 8, kind: "goal" },
];

// Two hazards per moving lane, evenly spaced, with direction and speed varying
// by lane. Cars are one cell wide; logs are wider so the frog can ride them.
const hazards: readonly Hazard[] = [
  { kind: "car", lane: 1, x: 0, width: 1, velocity: 1.5 },
  { kind: "car", lane: 1, x: 5, width: 1, velocity: 1.5 },
  { kind: "car", lane: 2, x: 2, width: 1, velocity: -2 },
  { kind: "car", lane: 2, x: 7, width: 1, velocity: -2 },
  { kind: "car", lane: 3, x: 1, width: 1, velocity: 2.5 },
  { kind: "car", lane: 3, x: 6, width: 1, velocity: 2.5 },
  { kind: "log", lane: 5, x: 0, width: 3, velocity: 1.5 },
  { kind: "log", lane: 5, x: 5, width: 3, velocity: 1.5 },
  { kind: "log", lane: 6, x: 2, width: 3, velocity: -1 },
  { kind: "log", lane: 6, x: 7, width: 2, velocity: -1 },
  { kind: "log", lane: 7, x: 1, width: 3, velocity: 2 },
  { kind: "log", lane: 7, x: 6, width: 3, velocity: 2 },
];

// The initial, full game state: frog at the bottom, three lives, nothing scored.
export const create = (): State => ({
  width,
  height,
  lanes,
  hazards,
  frog: startPosition({ width }),
  lives: 3,
  score: 0,
  status: "playing",
});
