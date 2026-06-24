// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { trackSchema } from "./schema.js";

// The plugin is built from the public schema but carries internal-only
// transactions; its type is large and must NOT leak into public emit.
/** @internal */
export const plugin = Database.Plugin.create({
    ...trackSchema,
    transactions: {
        addTrack: (t, kind: string) =>
            t.archetypes.Track.insert({ trackKind: kind, editingMode: "off", muted: false }),
    },
});

/** @internal */
export type SquirrelDatabase = Database.Plugin.ToDatabase<typeof plugin>;
