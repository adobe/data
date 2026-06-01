// © 2026 Adobe. MIT License. See /LICENSE for details.

import { useElement, useEffect } from "@adobe/data-lit";
import { attachOrbitDrag, type OrbitDragService } from "@adobe/data-gpu";

/**
 * Wires the host element's drag gesture to the `orbit` plugin via
 * `attachOrbitDrag`. Drag rotates the orbit (pausing auto-spin);
 * drag end un-pauses.
 */
export function useOrbitCameraControl(
    service: OrbitDragService,
    options: { sensitivity?: number } = {},
): void {
    const element = useElement();
    useEffect(() => attachOrbitDrag(element as HTMLElement, service, options), [element, service]);
}
