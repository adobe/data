// © 2026 Adobe. MIT License. See /LICENSE for details.

// A user a todo can be assigned to. `id` is the ECS entity; `name` is the join
// key shared with a todo's `assignees` list (see the assign feature's indexes).
export type User = {
  readonly id: number;
  readonly name: string;
};
