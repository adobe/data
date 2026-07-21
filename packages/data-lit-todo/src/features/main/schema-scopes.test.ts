// © 2026 Adobe. MIT License. See /LICENSE for details.
import { test } from "vitest";
import { assertSchemaScopes } from "@adobe/data/ecs";
import { DocumentDatabase } from "./ecs/document-database/document-database.js";
import { SettingsDatabase } from "./ecs/settings-database/settings-database.js";
import { SessionDatabase } from "./ecs/session-database/session-database.js";

// Guards the feature's schema scopes: document columns are shared+durable (no
// flags); the settings resource `displayCompleted` is local+durable
// (nonShared); the session component `dragPosition` is local+ephemeral
// (nonShared + nonPersistent).
test("main feature schema scopes are consistent", () => {
  assertSchemaScopes({
    document: DocumentDatabase.plugin,
    settings: SettingsDatabase.plugin,
    session: SessionDatabase.plugin,
  });
});
