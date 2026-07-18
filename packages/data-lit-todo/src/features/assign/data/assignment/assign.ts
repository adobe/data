// © 2026 Adobe. MIT License. See /LICENSE for details.

// Add a user name to a todo's assignee list. Idempotent — a name already
// present is returned unchanged. Pure: the input array is never mutated.
export const assign = (
  assignees: readonly string[],
  name: string,
): readonly string[] =>
  assignees.includes(name) ? assignees : [...assignees, name];
