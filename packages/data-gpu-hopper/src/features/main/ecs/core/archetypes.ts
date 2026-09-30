// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { components } from "../../data/components/index.js";
import { Hazard } from "../../data/entities/hazard.js";

// Archetype packing: exactly the spec `Hazard` entity.
export const archetypes = Database.archetypes(components, { Hazard });
