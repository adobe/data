// © 2026 Adobe. MIT License. See /LICENSE for details.
import { test } from "vitest";
import { assertPersistencePartition } from "@adobe/data/ecs";
import { PersistentDatabase } from "./ecs/persistent-database/persistent-database.js";
import { SessionDatabase } from "./ecs/session-database/session-database.js";

// Guards the assign feature's persistent/session split: its persistent columns
// are serializable, and the session database adds only the `User` archetype
// (no non-persistent components/resources of its own).
test("assign feature persistence partition is consistent", () => {
  assertPersistencePartition(PersistentDatabase.plugin, SessionDatabase.plugin);
});
