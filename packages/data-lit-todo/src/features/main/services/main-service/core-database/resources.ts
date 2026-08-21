// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database, Entity } from "@adobe/data/ecs";
import { Boolean } from "@adobe/data/schema";

export const resources = Database.resources({
  // The schema version is NOT a resource — it rides the save metadata (see
  // db.version and ../versioning/versions.ts).
  settings: {
    displayCompleted: Boolean.schema, // per-device view toggle; durable, not shared
  },
  session: {
    // The selected todo: a reference to one entity (`Entity.none` = no selection).
    // `Entity.schema` carries the `entity` mark, so conformance treats this as an id
    // and compares it to the ecs up to a bijection. Local, ephemeral view state.
    selectedTodo: { ...Entity.schema, default: Entity.none },
  },
});
