// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { Schema } from "@adobe/data/schema";
import type { Assert, Equal } from "@adobe/data/types";
import type { PlacedMark as PlacedMarkRow } from "../../data/placed-mark/placed-mark.js";
import { components } from "./components.js";

export const archetypes = Database.archetypes(components, {
  PlacedMark: ["mark", "index"],
});

// Drift guard: the archetype's inferred row shape must equal the PlacedMark
// data type. Fails to compile if the component set and the type diverge.
const placedMarkSchema = Schema.fromArchetype(components, archetypes.PlacedMark);
type _PlacedMarkMatches = Assert<
  Equal<Schema.ToType<typeof placedMarkSchema>, PlacedMarkRow>
>;
