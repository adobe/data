// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

// Representative full states for the projection round-trip.
export const samples: readonly State[] = [
  {
    users: new Map([
      [1, { user: true, name: "ada" }],
      [2, { user: true, name: "linus" }],
    ]),
    todos: new Map([
      [10, { name: "ship", complete: false, order: 0, assignees: ["ada", "linus"] }],
      [11, { name: "review", complete: true, order: 1, assignees: [] }],
    ]),
  },
  { users: new Map(), todos: new Map() },
];
