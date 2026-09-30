// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import type { State } from "../../spec/state.js";
import type { User } from "../../data/entities/user.js";
import type { AssignedTodo } from "../../data/entities/assigned-todo.js";
import type { CoreDatabase } from "../core/core-database.js";

// The test-only ecs↔`State` projection. `fromState` clears every user and todo, then
// seeds each (todos with main's implementation-only `todo` tag and `dragPosition`
// slot), returning the `spec id → seeded entity` map. `toState` reads them back.
export const projection = {
  fromState: (store: CoreDatabase.Store, state: State): ReadonlyMap<number, Entity> => {
    for (const entity of [...store.select(["user"]), ...store.select(["todo"])]) store.delete(entity);
    const seeded = new Map<number, Entity>();
    for (const [specId, user] of state.users) {
      seeded.set(specId, store.archetypes.User.insert({ user: true, name: user.name }));
    }
    for (const [specId, todo] of state.todos) {
      seeded.set(specId, store.archetypes.AssignedTodo.insert({ todo: true, ...todo, dragPosition: null }));
    }
    return seeded;
  },
  toState: (store: CoreDatabase.Store): State => ({
    users: new Map<number, User>(
      store.select(store.archetypes.User.components).flatMap((entity) => {
        const row = store.read(entity, store.archetypes.User);
        return row === null ? [] : [[entity, { user: true, name: row.name }]];
      }),
    ),
    todos: new Map<number, AssignedTodo>(
      store.select(["todo"]).flatMap((entity) => {
        const row = store.read(entity);
        if (row?.name === undefined || row.complete === undefined || row.order === undefined) return [];
        return [[entity, { name: row.name, complete: row.complete, order: row.order, assignees: row.assignees ?? [] }]];
      }),
    ),
  }),
};
