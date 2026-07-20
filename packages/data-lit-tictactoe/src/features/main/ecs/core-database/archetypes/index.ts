// © 2026 Adobe. MIT License. See /LICENSE for details.
// ECS archetypes — named component sets, each drift-guarded against its data type.
import { Schema } from "@adobe/data/schema";
import type { Assert, Equal } from "@adobe/data/types";
import type { PlacedMark as PlacedMarkRow } from "../../data/placed-mark/placed-mark.js";
import * as components from "../components/index.js";

export const PlacedMark = ["mark", "index"] as const satisfies Array<
  keyof typeof components
>;

// Drift guard: the archetype's inferred row shape must equal the PlacedMark
// data type. Fails to compile if the component set and the type diverge.
const placedMarkSchema = Schema.fromArchetype(components, PlacedMark);
type _PlacedMarkMatches = Assert<
  Equal<Schema.ToType<typeof placedMarkSchema>, PlacedMarkRow>
>;
