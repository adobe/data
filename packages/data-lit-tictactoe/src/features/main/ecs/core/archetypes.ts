// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { components } from "../../data/components/index.js";
import { PlacedMark } from "../../data/entities/placed-mark.js";

export const archetypes = Database.archetypes(components, { PlacedMark });
