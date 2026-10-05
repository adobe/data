// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Assert } from "@adobe/data/types";
import type { Conformance } from "@adobe/data-testing";
import type { User } from "../data/entities/user.js";
import type { AssignedTodo } from "../data/entities/assigned-todo.js";
import type { components } from "../data/components/index.js";

// The assign feature's state: users, and todos with their assignee names. Both maps
// share one id space (they are entities of one store), so cases use distinct ids
// across them.
export type State = {
  readonly users: ReadonlyMap<number, User>;
  readonly todos: ReadonlyMap<number, AssignedTodo>;
};

// Entity value keys name components (this feature has no resources).
type _Pin = Assert<Conformance.StateMatches<State, {}, typeof components>>;

export * as State from "./public.js";
