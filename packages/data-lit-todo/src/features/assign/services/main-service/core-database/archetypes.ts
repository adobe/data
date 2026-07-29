// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { components } from "./components.js";

export const archetypes = Database.archetypes(components, {
  User: ["user", "name"],
});
