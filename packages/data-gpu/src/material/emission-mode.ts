// © 2026 Adobe. MIT License. See /LICENSE for details.

/** Visible emission interpretation (matches legacy material schema). */
export const EmissionMode = {
    /** UV fluorescence — emissive does not add to visible output. */
    uvFluorescence: 0,
    /** Visible luminescence — `emissiveFactor` + `irEmission` contribute to the lit color. */
    visibleLuminescence: 1,
} as const;

export type EmissionMode = (typeof EmissionMode)[keyof typeof EmissionMode];
