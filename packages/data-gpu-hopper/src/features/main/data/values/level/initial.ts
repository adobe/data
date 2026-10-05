// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Level } from "./level.js";

// The game's board, bottom (row 0, the start) to top (row 8, the goal): a grass start,
// three car lanes, a grass median, three log lanes, then the goal. Two hazards per
// moving lane, direction and speed varying by lane; cars are one cell wide, logs wider
// so the frog can ride them.
export const initial: Level = {
  width: 9,
  height: 9,
  lanes: [
    { row: 0, kind: "grass" },
    { row: 1, kind: "road" },
    { row: 2, kind: "road" },
    { row: 3, kind: "road" },
    { row: 4, kind: "grass" },
    { row: 5, kind: "river" },
    { row: 6, kind: "river" },
    { row: 7, kind: "river" },
    { row: 8, kind: "goal" },
  ],
  hazards: [
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
  ],
  lives: 3,
};
