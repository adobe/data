// © 2026 Adobe. MIT License. See /LICENSE for details.

import { useDraggable, useElement, useRef } from "@adobe/data-lit";

/**
 * Drag-to-orbit camera hook. Attaches a pointer drag listener to the host
 * element and emits the per-event horizontal pixel delta. Callers wire the
 * delta into whatever transaction rotates their camera.
 *
 * Used across PBR / IBL / solar-system samples that share this gesture.
 */
export function useOrbitDragCamera(
    onDelta: (deltaX: number) => void,
    onEnd?: () => void,
): void {
    const element = useElement();
    // Latest-callbacks ref so useDraggable's effect deps stay stable.
    const callbacks = useRef({ onDelta, onEnd });
    callbacks.current.onDelta = onDelta;
    callbacks.current.onEnd = onEnd;

    const state = useRef({ lastDx: 0 });
    useDraggable(element, {
        minDragDistance: 1,
        onDragStart: () => { state.current.lastDx = 0; },
        onDrag: (_e, _pos, delta) => {
            const dx = delta[0] - state.current.lastDx;
            state.current.lastDx = delta[0];
            callbacks.current.onDelta(dx);
        },
        onDragEnd: () => { callbacks.current.onEnd?.(); },
        onDragCancel: () => { callbacks.current.onEnd?.(); },
    }, []);
}
