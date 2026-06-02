// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Material } from "./material.js";

/** Per-material physical constants the solver and seeding read. */
export interface MaterialProperties {
    /** Relative density — drives mass and inertia at seed time. */
    density: number;
    /** Coefficient of restitution [0,1] — bounce (used by the velocity pass, S2). */
    restitution: number;
    /** Coulomb friction coefficient [0,1] (used by the velocity pass, S2). */
    friction: number;
    /** Contact compliance (m/N); 0 = perfectly rigid, larger = softer (S3). */
    compliance: number;
    /** Specific heat — reserved for future friction→heat thermal work. */
    heatCapacity: number;
}

export const properties: Record<Material, MaterialProperties> = {
    rubber: { density: 1.1,  restitution: 0.80, friction: 0.90, compliance: 1e-5, heatCapacity: 2.0 },
    wood:   { density: 0.6,  restitution: 0.35, friction: 0.70, compliance: 5e-7, heatCapacity: 1.7 },
    stone:  { density: 2.6,  restitution: 0.20, friction: 0.85, compliance: 1e-8, heatCapacity: 0.8 },
    steel:  { density: 7.8,  restitution: 0.45, friction: 0.50, compliance: 1e-9, heatCapacity: 0.5 },
    ice:    { density: 0.92, restitution: 0.25, friction: 0.05, compliance: 5e-9, heatCapacity: 2.1 },
};
