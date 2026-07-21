// © 2026 Adobe. MIT License. See /LICENSE for details.
import { test } from "vitest";
import { assertSchemaScopes } from "@adobe/data/ecs";
import { DocumentDatabase } from "./ecs/document-database/document-database.js";

// Guards the feature's schema scopes. tictactoe is document-only — everything
// is shared + durable, so nothing carries nonShared or nonPersistent.
test("main feature schema scopes are consistent", () => {
  assertSchemaScopes({ document: DocumentDatabase.plugin });
});
