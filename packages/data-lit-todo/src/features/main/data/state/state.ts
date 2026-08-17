// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import type { Todo } from "../todo/todo.js";

// The full persistent application state as one immutable object — the
// specification the ECS implementation is verified against. `entities` holds every
// todo keyed by a numeric id (identity is the key, never a value field); each
// value carries its own `order` for display sorting. `displayCompleted` is a
// singleton toggle. `selectedTodo` is a **reference singleton** — it points at one
// entity by id (`Entity.none` = no selection). Reusing the ECS `Entity` type here
// is deliberate and allowed (it is a plain branded `number`): the same
// `Entity.schema` that types this reference is what conformance walks to compare it
// to the ECS up to an id-bijection.
export type State = {
  readonly displayCompleted: boolean;
  readonly entities: ReadonlyMap<number, Todo>;
  readonly selectedTodo: Entity;
};
export * as State from "./public.js";
