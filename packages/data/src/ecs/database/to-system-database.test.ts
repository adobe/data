// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { Database } from "./database.js";

describe("Database.toSystemDatabase", () => {
  const plugin = Database.Plugin.create({
    components: { value: { type: "number" }, tag: { type: "boolean" } },
    resources: { count: { default: 0 as number } },
    archetypes: { Thing: ["value", "tag"] },
  });

  it("is identity at runtime and exposes the writable store", () => {
    const db = Database.create(plugin);
    const sys = Database.toSystemDatabase(db);

    // Same instance — purely a type-level re-view.
    expect(sys).toBe(db);

    // The store surface is now reachable and writable.
    sys.store.resources.count = 5;
    expect(sys.store.resources.count).toBe(5);
    const entity = sys.store.archetypes.Thing.insert({ value: 1, tag: true });
    expect(sys.store.read(entity, sys.store.archetypes.Thing)?.value).toBe(1);
  });
});
