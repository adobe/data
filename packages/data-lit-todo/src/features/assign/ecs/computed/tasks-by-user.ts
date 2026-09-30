// © 2026 Adobe. MIT License. See /LICENSE for details.
import { cached } from "@adobe/data/cache";
import { compare } from "@adobe/data/functions";
import { Observe } from "@adobe/data/observe";
import type { IndexDatabase } from "../indexes/index-database.js";

// Each user with the names of the tasks assigned to them (in display order) — the user→todos
// direction, resolved through the `todosByAssignee` index. `db.derive` reads the
// index, so this re-derives whenever any todo's assignees change. `withCache`
// shares one run across all subscribers.
export const tasksByUser = cached((db: IndexDatabase) =>
  Observe.withCache(
    db.derive(
      (read): readonly { readonly user: string; readonly tasks: readonly string[] }[] => {
        const result: { user: string; tasks: string[] }[] = [];
        for (const uid of read.select(db.archetypes.User.components)) {
          const u = read.read(uid);
          if (!u || u.name === undefined) continue;
          const tasks: { name: string; order: number }[] = [];
          for (const tid of read.indexes.todosByAssignee.find({ assignees: u.name })) {
            const todo = read.read(tid);
            if (todo?.name !== undefined && todo.order !== undefined) tasks.push({ name: todo.name, order: todo.order });
          }
          tasks.sort((a, b) => a.order - b.order);
          result.push({ user: u.name, tasks: tasks.map((task) => task.name) });
        }
        return result.sort((a, b) => compare(a.user, b.user));
      },
    ),
  ),
);
