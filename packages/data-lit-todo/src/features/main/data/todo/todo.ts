// © 2026 Adobe. MIT License. See /LICENSE for details.

// A single todo entity in the logical application State. The array position in
// `State.todos` is its display order; the ECS materialises that ordering with
// an `order` component (an implementation detail absent from the spec).
export type Todo = {
  readonly id: number;
  readonly name: string;
  readonly complete: boolean;
};
export * as Todo from "./public.js";
