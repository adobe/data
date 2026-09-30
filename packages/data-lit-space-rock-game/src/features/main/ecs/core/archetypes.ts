// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { components } from "../../data/components/index.js";
import { entities } from "../../data/entities/index.js";

// One archetype per spec entity, packed exactly as declared (the ship is a resource).
export const archetypes = Database.archetypes(components, {
  Bullet: entities.Bullet,
  Asteroid: entities.Asteroid,
});
