// © 2026 Adobe. MIT License. See /LICENSE for details.
// name → the user with that name. Unique: a name identifies one user, so
// `db.indexes.usersByName.get({ name }) → Entity | null`. Scoped to the `User`
// archetype so it never collides with todos, which share the `name` column.
// Powers the todo→users direction (resolve each assignee name to a user).
//
// Declared with `as const` (not `satisfies PersistentDatabase.Index`): that helper
// carries the component map but not the archetype map, so it cannot express the
// `archetype` scope. `index-database.ts` validates it on registration.
export const usersByName = {
  key: "name",
  archetype: "User",
  unique: true,
} as const;
