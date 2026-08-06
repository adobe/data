// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

// The initial dashboard state — the defaults the ECS resources also carry.
export const create = (): State => ({ count: 0, log: [], userName: "Guest" });
