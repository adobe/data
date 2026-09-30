// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ComputedDatabase } from "../computed/computed-database.js";

export const addUser = (db: ComputedDatabase, { name }: { readonly name: string }) => {
  db.transactions.addUser({ name });
};
