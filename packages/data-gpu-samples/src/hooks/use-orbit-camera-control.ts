// © 2026 Adobe. MIT License. See /LICENSE for details.

import { useOrbitDragCamera } from "./use-orbit-drag-camera.js";

/** Subset of an orbit-camera service that the drag hook drives. */
interface OrbitControlService {
    transactions: {
        addOrbitAngle: (delta: number) => void;
        resumeAutoSpin: () => void;
    };
}

/**
 * Wires the host element's drag gesture to the `orbit` plugin: drag
 * moves rotate the orbit (pausing auto-spin), drag end un-pauses. Sensitivity
 * is in radians per drag pixel; default matches the previous samples.
 */
export function useOrbitCameraControl(
    service: OrbitControlService,
    options: { sensitivity?: number } = {},
): void {
    const sensitivity = options.sensitivity ?? 0.01;
    useOrbitDragCamera(
        dx => service.transactions.addOrbitAngle(-dx * sensitivity),
        () => service.transactions.resumeAutoSpin(),
    );
}
