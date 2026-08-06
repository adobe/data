// © 2026 Adobe. MIT License. See /LICENSE for details.

// The whole dashboard modelled as one immutable value — the specification the
// ECS implementation is verified against. Every field is a scalar (no entity
// collections); `log` is an append-only activity trail in chronological order.
export type State = {
  readonly count: number;
  readonly log: readonly string[];
  readonly userName: string;
};
export * as State from "./public.js";
