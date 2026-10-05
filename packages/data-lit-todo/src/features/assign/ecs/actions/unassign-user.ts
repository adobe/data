// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import type { ComputedDatabase } from "../computed/computed-database.js";

export const unassignUser = (db: ComputedDatabase, { todo, name }: { readonly todo: Entity; readonly name: string }) => {
  db.transactions.unassignUser({ todo, name });
};
