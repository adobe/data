// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { IndexDatabase } from "../../index-database/index-database.js";

// Create a user entity. Uses the unique `usersByName` index to keep names
// distinct — a duplicate name is silently ignored (idempotent under replay).
export const addUser = (
  t: IndexDatabase.Store,
  { name }: { readonly name: string },
) => {
  const trimmed = name.trim();
  // Compare against null, not truthiness: a valid user entity may have id 0.
  if (trimmed === "" || t.indexes.usersByName.get({ name: trimmed }) !== null) return;
  t.archetypes.User.insert({ user: true, name: trimmed });
};
