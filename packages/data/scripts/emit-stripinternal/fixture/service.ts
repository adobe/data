// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ArchetypeHandleOf } from "@adobe/data/ecs";
import { trackSchema } from "./schema.js";

// Hand-written public interface (NOT Database.Plugin.ToDatabase<typeof plugin>),
// archetype handle derived inline from the PUBLIC schema.
export interface TrackService {
    readonly archetypes: {
        readonly Track: ArchetypeHandleOf<typeof trackSchema, "Track">;
    };
}
