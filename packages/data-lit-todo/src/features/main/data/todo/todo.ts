// © 2026 Adobe. MIT License. See /LICENSE for details.

// A single todo entity value in the logical application State — plain readonly
// data with NO id: identity is the key of `State.entities`, never a field. The
// `order` component carries the display order (the ECS materialises it the same
// way), so entity values compare by content across the spec↔ecs boundary.
export type Todo = {
  readonly name: string;
  readonly complete: boolean;
  readonly order: number;
};
export * as Todo from "./public.js";
