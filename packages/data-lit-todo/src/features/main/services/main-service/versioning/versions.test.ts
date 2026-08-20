// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// The two guard tests every versioned database keeps. If either fails, its error
// message is a recipe — follow it (edit versions.ts / resources.ts) and re-run.

import { describe, it } from "vitest";
import { Database, storeSchemas, assertVersionsMatchSchema, testUpgradeHandlers } from "@adobe/data/ecs";
import { MainService } from "../main-service.js";
import { versions } from "./versions.js";

describe("database schema versions", () => {
  it("the version history matches the current schema", () => {
    const db = Database.create(MainService.plugin);
    assertVersionsMatchSchema({
      entries: versions,
      ...storeSchemas(db),
      versionResource: "databaseVersion",
      currentVersion: db.resources.databaseVersion,
    });
  });

  it("every upgrade handler has a unit test", () =>
    testUpgradeHandlers(versions, {
      // Append a case here for each version that adds a `handler`. Empty today
      // because no version needs one yet — every change so far is auto-convertible.
    }));
});
