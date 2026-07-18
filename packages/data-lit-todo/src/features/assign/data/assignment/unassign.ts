// © 2026 Adobe. MIT License. See /LICENSE for details.

// Remove a user name from a todo's assignee list. Pure: returns a new array,
// the input is never mutated.
export const unassign = (
  assignees: readonly string[],
  name: string,
): readonly string[] => assignees.filter((n) => n !== name);
