// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { components } from "../../data/components/index.js";
import { Sprite } from "../../data/entities/sprite.js";

export const archetypes = Database.archetypes(components, {
  Sprite,
});
