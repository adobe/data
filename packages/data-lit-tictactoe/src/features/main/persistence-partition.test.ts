// © 2026 Adobe. MIT License. See /LICENSE for details.
import { test } from "vitest";
import { assertPersistencePartition } from "@adobe/data/ecs";
import { PersistentDatabase } from "./ecs/persistent-database/persistent-database.js";
import { SessionDatabase } from "./ecs/session-database/session-database.js";

// Guards the feature's persistent/session split: everything in the persistent
// database is serializable, and every component/resource the session database
// adds is explicitly `nonPersistent: true`.
test("main feature persistence partition is consistent", () => {
  assertPersistencePartition(PersistentDatabase.plugin, SessionDatabase.plugin);
});
