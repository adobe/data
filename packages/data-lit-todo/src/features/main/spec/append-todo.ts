// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

// Internal state helper — its own file per the namespace pattern, but NOT
// re-exported through `public.ts`, so it is not a public `State.` transform and
// carries no conformance cases. Shared by the `createTodo` and `createRandomTodo`
// transitions so the pure append stays single-sourced while each fires its own
// analytics side effect. Reads the entities, writes the entities — an `{ entities }`
// patch. Mints the next id (the map key) and sets `order` to the current size so
// the todo sorts after every existing one.
export const appendTodo = (
  state: Pick<State, "entities">,
  input: { readonly name: string; readonly complete?: boolean },
): Pick<State, "entities"> => {
  const id = Math.max(0, ...state.entities.keys()) + 1;
  const order = state.entities.size;
  return {
    entities: new Map(state.entities).set(id, {
      name: input.name,
      complete: input.complete ?? false,
      order,
    }),
  };
};
