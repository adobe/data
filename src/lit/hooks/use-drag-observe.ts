// © 2026 Adobe. MIT License. See /LICENSE for details.

import { DraggableProps, useDraggable } from './use-draggable.js';
import { useElement } from './use-element.js';
import { Observe } from '../../observe/index.js';
import { Vec2 } from '../../math/index.js';

export type DragObserveProps = Pick<
    DraggableProps,
    'minDragDistance' | 'dragCursor' | 'addPlaceholder' | 'stopPropagation'
>;
export type DragStart = {
    readonly type: 'start' | 'cancel';
};
export type DragMove = {
    readonly type: 'move';
    readonly delta: Vec2;
    readonly position: Vec2;
};
export type DragEnd = {
    readonly type: 'end';
    readonly delta: Vec2;
    readonly position: Vec2;
};
export type DragState = DragStart | DragMove | DragEnd;

/**
 * This hook creates a drag observe function that can be used to observe the drag state of an element.
 * This is normally not used directly, but rather through the `useDragTransaction` hook.
 * @param props
 * @returns
 */
export function useDragObserve(props: DragObserveProps, dependencies: unknown[]) {
    const [dragState, setDragState] = Observe.createEvent<DragState>();
    const element = useElement();
    useDraggable(element,
        {
            ...props,
            onDragStart: _e => {
                setDragState({ type: 'start' });
            },
            onDrag: (_e, position, delta) => {
                setDragState({
                    type: 'move',
                    position,
                    delta,
                });
            },
            onDragEnd: (_e, position, delta) => {
                setDragState({ type: 'end', position, delta });
            },
            onDragCancel: () => {
                setDragState({ type: 'cancel' });
            },
        },
        dependencies
    );
    return dragState;
}
