// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// The ONE co-located guard every versioned database keeps. It runs both checks —
// the history folds to the current schema, and every upgrade handler has a passing
// test. If it fails, the error message is a recipe: follow it (edit versions.ts /
// resources.ts, add a handler case here) and re-run.

import { describe, it } from "vitest";
import { Database, assertVersioning } from "@adobe/data/ecs";
import { MainService } from "../main-service.js";
import { versions } from "./versions.js";

describe("database schema versions", () => {
  it("the version history is consistent (schema folds + every handler tested)", () =>
    assertVersioning({
      database: Database.create(MainService.plugin),
      entries: versions,
      versionResource: "documentVersion",
      handlers: {
        // Append a case here for each version that adds a `handler`. Empty today
        // because no version needs one yet — every change so far is auto-convertible.
      },
    }));
});
