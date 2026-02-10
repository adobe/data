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
        let downPosition: Vec2 | null = null;
        // the bounds of the element when the pointer was first pressed down.
        let dragStartOffset: Vec2 | null = null;
        let originalCursor = '';
        let placeholder: HTMLElement | null = null;
        let movePosition: Vec2 = [0, 0];
        function notify(e: PointerEvent, dragListener: DraggableProps["onDrag"]) {
            const delta = Vec2.subtract(movePosition, downPosition!);
            dragListener(e, Vec2.add(dragStartOffset!, delta), delta);
        }

        function onPointerMove(e: PointerEvent) {
            movePosition = [e.clientX, e.clientY];
            if (Vec2.length(Vec2.subtract(movePosition, downPosition!)) >= minDragDistance) {
                if (!dragStartOffset) {
                    dragStartOffset = [element.offsetLeft, element.offsetTop];
                    props.onDragStart(e);
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
                }
            }
            if (dragStartOffset) {
                notify(e, props.onDrag);
            }
            if (stopPropagation) e.stopPropagation();
        }
        function cleanup() {
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            window.removeEventListener('pointerup', onPointerUp);
            window.removeEventListener('pointermove', onPointerMove);
            if (dragCursor) {
                element.style.cursor = originalCursor;
            }
            if (placeholder) {
                placeholder.remove();
                placeholder = null;
            }
        }
        function onPointerUp(e: PointerEvent) {
            cleanup();
            if (dragStartOffset && props.onDragEnd) {
                notify(e, props.onDragEnd);
            }
            if (stopPropagation) e.stopPropagation();
            downPosition = null;
            dragStartOffset = null;
        }
        function onPointerDown(e: PointerEvent) {
            // Only start drag transaction for left mouse button clicks
            if (e.button !== 0) return;

            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp);
            downPosition = [e.clientX, e.clientY];
            if (stopPropagation) e.stopPropagation();
        }

        element?.addEventListener('pointerdown', onPointerDown);
        return () => {
            element?.removeEventListener('pointerdown', onPointerDown);
            if (downPosition) {
                cleanup();
            }
            if (dragStartOffset) {
                props.onDragCancel?.();
            }
        };
    }, [element, ...(dependencies ?? [])]);
}
