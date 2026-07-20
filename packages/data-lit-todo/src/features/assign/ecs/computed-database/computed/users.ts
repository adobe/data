// © 2026 Adobe. MIT License. See /LICENSE for details.
import { cached } from "@adobe/data/cache";
import { compare } from "@adobe/data/functions";
import { Observe } from "@adobe/data/observe";
import type { User } from "../../data/user/user.js";
import type { IndexDatabase } from "../index-database.js";

// All users, sorted by name. Feeds both the dropdown (pick a user) and the
// users tab (list). Code-point sort — never localeCompare (order determinism).
// `withCache` multicasts one db.derive run to all subscribers (and caches the
// last value for late ones), so N elements observing this share one computation.
export const users = cached((db: IndexDatabase) =>
  Observe.withCache(
    db.derive((read): readonly User[] => {
      const result: User[] = [];
      for (const id of read.select(db.archetypes.User.components)) {
        const u = read.read(id);
        if (u && u.name !== undefined) result.push({ id, name: u.name });
      }
      return result.sort((a, b) => compare(a.name, b.name));
    }),
  ),
);
