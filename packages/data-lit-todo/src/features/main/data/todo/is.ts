// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Todo } from "./todo.js";

// A structural type guard, re-exported through `public.ts` so it reads `Todo.is`.
// Matches purely on structure (name/complete/order), mirroring how the ECS matches
// on components — there is no `id` to check because identity is the map key.
export const is = (v: unknown): v is Todo =>
  typeof v === "object" &&
  v !== null &&
  "name" in v &&
  typeof v.name === "string" &&
  "complete" in v &&
  typeof v.complete === "boolean" &&
  "order" in v &&
  typeof v.order === "number";
