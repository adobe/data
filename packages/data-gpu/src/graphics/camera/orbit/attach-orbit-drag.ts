// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { OrbitDragService } from "./orbit-drag-service.js";

/**
 * Attaches pointer-drag listeners to `element` that drive orbit rotation.
 * Returns a dispose function to remove the listeners.
 *
 * Framework-agnostic — pass the returned dispose to whatever cleanup
 * mechanism your framework provides (useEffect return, onUnmount, etc.).
 */
export function attachOrbitDrag(
    element: HTMLElement,
    service: OrbitDragService,
    options?: { sensitivity?: number },
): () => void {
    const sensitivity = options?.sensitivity ?? 0.01;
    let lastX = 0;

    const onDown = (e: PointerEvent) => {
        lastX = e.clientX;
        element.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
        if (!e.buttons) return;
        service.transactions.addOrbitAngle((lastX - e.clientX) * sensitivity);
        lastX = e.clientX;
    };
    const onUp = () => service.transactions.resumeAutoSpin();

    element.addEventListener("pointerdown", onDown);
    element.addEventListener("pointermove", onMove);
    element.addEventListener("pointerup", onUp);
    element.addEventListener("pointercancel", onUp);

    return () => {
        element.removeEventListener("pointerdown", onDown);
        element.removeEventListener("pointermove", onMove);
        element.removeEventListener("pointerup", onUp);
        element.removeEventListener("pointercancel", onUp);
    };
}
