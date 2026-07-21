// © 2026 Adobe. MIT License. See /LICENSE for details.
import { test } from "vitest";
import { assertSchemaScopes } from "@adobe/data/ecs";
import { DocumentDatabase } from "./ecs/document-database/document-database.js";

// The assign feature is document-only — its user columns are shared + durable,
// so nothing carries nonShared or nonPersistent. (The `User` archetype is a
// packing construct in the archetype layer, not a schema scope.)
test("assign feature schema scopes are consistent", () => {
  assertSchemaScopes({ document: DocumentDatabase.plugin });
});
