// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { Schema } from "@adobe/data/schema";
import type { Assert, Equal } from "@adobe/data/types";
import type { Frog as FrogRow } from "../../data/frog/frog.js";
import type { Hazard as HazardRow } from "../../data/hazard/hazard.js";
import { components } from "./components.js";

// The two moving entity shapes. The frog is a single entity distinguished by its
// `y` column; hazards are many, each carrying its own `velocity` (per-entity, so
// cars and logs in a lane advance independently).
export const archetypes = Database.archetypes(components, {
  Frog: ["x", "y"],
  Hazard: ["kind", "lane", "x", "width", "velocity"],
});

// Drift guards: each archetype's inferred row shape must equal its data/ row
// type. Fails to compile if the component set and the type diverge.
const frogSchema = Schema.fromArchetype(components, archetypes.Frog);
type _FrogMatches = Assert<Equal<Schema.ToType<typeof frogSchema>, FrogRow>>;

const hazardSchema = Schema.fromArchetype(components, archetypes.Hazard);
type _HazardMatches = Assert<Equal<Schema.ToType<typeof hazardSchema>, HazardRow>>;
