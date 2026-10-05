// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { CoreDatabase } from "../core/core-database.js";

// Change the active user's name and log the change.
export const setUserName = (t: CoreDatabase.Store, { name }: { readonly name: string }) => {
  t.resources.userName = name;
  t.resources.log = [...t.resources.log, `Name changed to ${name}`];
};
