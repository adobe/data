// © 2026 Adobe. MIT License. See /LICENSE for details.
// The many-to-many between todos and users, made queryable in both directions.
// Loading the assign feature is what adds these indexes to the shared database.
//
// Declared with `as const` (not `satisfies CoreDatabase.Index`): that helper is
// `Database.Index<C>`, which carries the component map but not the archetype
// map, so it cannot express the `archetype` scope below. `index-database.ts`
// validates these against the real `indexes` facet type when it registers them.

// name → the user with that name. Unique: a name identifies one user, so
// `db.indexes.usersByName.get({ name }) → Entity | null`. Scoped to the `User`
// archetype so it never collides with todos, which share the `name` column.
// Powers the todo→users direction (resolve each assignee name to a user).
export const usersByName = {
  key: "name",
  archetype: "User",
  unique: true,
} as const;

// assignee name → the todos assigned to that user. `assignees` is a string[]
// column, so the index auto-fans-out one bucket entry per element:
// `db.indexes.todosByAssignee.find({ assignees: name }) → readonly Entity[]`.
// Only todos carry `assignees`, so the column alone scopes it to todos. Powers
// the user→todos direction ("tasks assigned to each user").
export const todosByAssignee = {
  key: "assignees",
} as const;
