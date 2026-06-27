// © 2026 Adobe. MIT License. See /LICENSE for details.

/** Mass (kg) from collider volume (m³) and material density (kg/m³). */
export const massFromVolume = (volume: number, density: number): number => volume * density;
