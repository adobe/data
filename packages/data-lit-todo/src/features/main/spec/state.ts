// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import type { Assert } from "@adobe/data/types";
import type { Conformance } from "@adobe/data-testing";
import type { Todo } from "../data/entities/todo.js";
import type { components } from "../data/components/index.js";
import type { resources } from "../data/resources/index.js";

// The application state as one immutable object — the specification the ECS
// implementation is verified against. `entities` holds every
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

// Singleton keys name resources; entity value keys name components.
type _Pin = Assert<Conformance.StateMatches<State, typeof resources, typeof components>>;

export * as State from "./public.js";
