// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { FilterKind } from "../../../data/filter-kind/filter-kind.js";

export const resources = Database.resources({
  settings: {
    filter: FilterKind.schema, // scene-wide view filter; the schema carries a "none" default
  },
});
