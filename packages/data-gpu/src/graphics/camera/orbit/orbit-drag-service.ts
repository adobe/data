// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Minimal service interface required by attachOrbitDrag — just the two
 * orbit transactions it calls. Any service that combines Orbit.plugin
 * satisfies this.
 */
export interface OrbitDragService {
    transactions: {
        addOrbitAngle(delta: number): void;
        resumeAutoSpin(): void;
    };
}
