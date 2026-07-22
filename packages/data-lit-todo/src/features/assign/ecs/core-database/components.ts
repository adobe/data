// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { True } from "@adobe/data/schema";
import { Name } from "../../../main/data/name/name.js";
import { Assignees } from "../../../main/data/assignees/assignees.js";

export const components = Database.components({
  document: {
    user: True.schema, // tag: presence marks the entity as a user
    // Shared with main by identity (same data/ schemas) so combinePlugins dedupes.
    name: Name.schema,
    assignees: Assignees.schema,
  },
});
