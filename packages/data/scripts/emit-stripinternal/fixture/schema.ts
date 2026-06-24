// © 2026 Adobe. MIT License. See /LICENSE for details.
export const trackComponents = {
    trackKind: { type: "string" },
    editingMode: { type: "string" },
    muted: { type: "boolean" },
} as const;

export const trackSchema = {
    components: trackComponents,
    archetypes: {
        Track: ["trackKind", "editingMode", "muted"],
    },
} as const;
