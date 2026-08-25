// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// The database's schema version history. `entries[i]` IS version `i`; folding
// every entry's `changes` from empty reconstructs the current persisted schema,
// and the co-located test (versions.test.ts) fails if it doesn't.
//
// HOW TO EVOLVE THIS FILE:
//   • Change a component/resource schema in core-database, then run the tests.
//   • If a test fails, it prints the exact entry to append here. Do THAT — do not
//     edit an existing entry. `db.version` follows the history automatically
//     (= entries.length - 1); there is no resource default to set.
//   • Additive/minor changes need only the `changes` patch (no handler).
//   • A change flagged BREAKING needs a `handler` (see the test's message).
//
// Existing entries are FROZEN history — never edit or reorder them.

import type { VersionEntry } from "@adobe/data/ecs";

export const versions: readonly VersionEntry[] = [
  // ── version 0 — the initial persisted schema (a frozen copy; never change it) ──
  {
    version: 0,
    changes: {
      components: {
        user: { type: "boolean", const: true, default: true },
        name: { type: "string" },
        assignees: { type: "array", items: { type: "string" }, default: [] },
        todo: { type: "boolean", const: true, default: true },
        complete: { type: "boolean", default: false },
        order: { type: "number", precision: 1, default: 0 },
      },
      resources: {
        displayCompleted: { type: "boolean", default: false, nonShared: true },
      },
    },
  },
];
