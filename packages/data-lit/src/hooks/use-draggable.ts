// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Vec2 } from '@adobe/data/math';
import { useEffect } from './use-effect.js';

function toCssUnitString(value: number): string {
    return `${value}px`;
}

export interface DraggableProps {
    //  onDragStart should return the initial position of the element
    onDragStart: (e: PointerEvent) => Vec2 | void;
    onDrag: (e: PointerEvent, newPosition: Vec2, delta: Vec2) => void;
    onDragEnd?: (e: PointerEvent, newPosition: Vec2, delta: Vec2) => void;
    /**
     * Called if this hook is destroyed before the drag is completed.
     */
    onDragCancel?: () => void;
    minDragDistance?: number;
    dragCursor?: string;
    addPlaceholder?: boolean;
    stopPropagation?: boolean;
}

export function useDraggable(element: HTMLElement, props: DraggableProps, dependencies: unknown[]) {
    const { minDragDistance = 10, dragCursor = 'grab', addPlaceholder = false, stopPropagation = false } = props;
    useEffect(() => {
        const minDragDistanceSquared = minDragDistance * minDragDistance;
        // The pointer that started the session; other pointers are ignored until it ends.
        let pointerId: number | null = null;
        let downPosition: Vec2 = [0, 0];
        // The element position when the drag started, or null before the threshold is crossed.
        let dragStartOffset: Vec2 | null = null;
        let originalCursor = '';
        let placeholder: HTMLElement | null = null;

        function notify(e: PointerEvent, start: Vec2, dragListener: DraggableProps["onDrag"]) {
            const delta: Vec2 = [e.clientX - downPosition[0], e.clientY - downPosition[1]];
            dragListener(e, Vec2.add(start, delta), delta);
        }

        function startDrag(e: PointerEvent): Vec2 {
            const offset: Vec2 = [element.offsetLeft, element.offsetTop];
            const start = (props.onDragStart(e) as Vec2 | undefined) ?? offset;
            dragStartOffset = start;
            if (dragCursor) {
                originalCursor = element.style.cursor;
                element.style.cursor = dragCursor;
            }
            // add a placeholder so the parent element doesn't change size when the element is dragged.
            if (addPlaceholder) {
                placeholder = document.createElement('div');
                Object.assign(placeholder.style, {
                    position: 'absolute',
                    backgroundColor: 'pink',
                    left: toCssUnitString(element.offsetLeft),
                    top: toCssUnitString(element.offsetTop),
                    width: toCssUnitString(element.offsetWidth),
                    height: toCssUnitString(element.offsetHeight),
                    visibility: 'hidden',
                });
                element.parentElement?.appendChild(placeholder);
            }
            return start;
        }

        function onPointerMove(e: PointerEvent) {
            if (e.pointerId !== pointerId) return;
            let start = dragStartOffset;
            if (!start) {
                const dx = e.clientX - downPosition[0];
                const dy = e.clientY - downPosition[1];
                if (dx * dx + dy * dy >= minDragDistanceSquared) {
                    start = startDrag(e);
                }
            }
            if (start) {
                notify(e, start, props.onDrag);
            }
            if (stopPropagation) e.stopPropagation();
        }

        /** Ends the session and restores the element; returns the drag start if a drag had started. */
        function release(): Vec2 | null {
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            window.removeEventListener('pointerup', onPointerUp);
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            window.removeEventListener('pointercancel', onPointerCancel);
            window.removeEventListener('pointermove', onPointerMove);
            const start = dragStartOffset;
            if (start && dragCursor) {
                element.style.cursor = originalCursor;
            }
            placeholder?.remove();
            placeholder = null;
            pointerId = null;
            dragStartOffset = null;
            return start;
        }

        function onPointerUp(e: PointerEvent) {
            if (e.pointerId !== pointerId) return;
            const start = release();
            if (start && props.onDragEnd) {
                notify(e, start, props.onDragEnd);
            }
            if (stopPropagation) e.stopPropagation();
        }

        function onPointerCancel(e: PointerEvent) {
            if (e.pointerId !== pointerId) return;
            if (release()) {
                props.onDragCancel?.();
            }
        }

        function onPointerDown(e: PointerEvent) {
            // Only start drag transaction for left mouse button clicks
            if (e.button !== 0 || pointerId !== null) return;

            pointerId = e.pointerId;
            downPosition = [e.clientX, e.clientY];
            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp);
            window.addEventListener('pointercancel', onPointerCancel);
            if (stopPropagation) e.stopPropagation();
        }

        element?.addEventListener('pointerdown', onPointerDown);
        return () => {
            element?.removeEventListener('pointerdown', onPointerDown);
            if (pointerId !== null && release()) {
                props.onDragCancel?.();
            }
        };
    }, [element, ...(dependencies ?? [])]);
}
