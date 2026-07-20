// © 2026 Adobe. MIT License. See /LICENSE for details.
// assignee name → the todos assigned to that user. `assignees` is a string[]
// column, so the index auto-fans-out one bucket entry per element:
// `db.indexes.todosByAssignee.find({ assignees: name }) → readonly Entity[]`.
// Only todos carry `assignees`, so the column alone scopes it to todos. Powers
// the user→todos direction ("tasks assigned to each user").
export const todosByAssignee = {
  key: "assignees",
} as const;
