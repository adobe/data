// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "@adobe/data/schema";

// The asteroid size tiers, largest first. This enum is the ONLY place the
// members are named; every consumer goes through the descriptors below.
export const schema = {
  type: "string",
  enum: ["large", "medium", "small"],
  description: "Asteroid size tier",
  default: "large",
} as const satisfies Schema;
