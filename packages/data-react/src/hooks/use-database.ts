// © 2026 Adobe. MIT License. See /LICENSE for details.

import { useContext } from "react";
import { Database } from "@adobe/data/ecs";
import { DatabaseContext } from "../context/database-context.js";

export function useDatabase<T extends Database.Plugin>(plugin: T): Database.FromPlugin<T> {
  const ancestor = useContext(DatabaseContext);
  if (ancestor) {
    return ancestor.extend(plugin) as unknown as Database.FromPlugin<T>;
  }
  return Database.create(plugin) as unknown as Database.FromPlugin<T>;
}
