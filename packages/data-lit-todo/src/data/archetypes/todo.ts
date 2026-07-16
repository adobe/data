// © 2026 Adobe. MIT License. See /LICENSE for details.
import * as components from "../components/index.js";

export const Todo = [
  "todo",
  "name",
  "complete",
  "order",
  "dragPosition",
] as const satisfies Array<keyof typeof components>;
