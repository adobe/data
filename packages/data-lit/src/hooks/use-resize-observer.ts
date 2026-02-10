// © 2026 Adobe. MIT License. See /LICENSE for details.

import { useEffect } from "./use-effect.js";
import { useElement } from "./use-element.js";

export interface ResizeInfo {
    width: number;
    height: number;
    entry: ResizeObserverEntry;
}

/**
 * Hook to observe element resizes. Calls callback with width, height, and the original entry
 * when the element's size changes.
 * 
 * @param onResize - Callback invoked when element size changes
 */
export function useResizeObserver(onResize: (info: ResizeInfo) => void) {
    const element = useElement();

    useEffect(() => {
        const observer = new ResizeObserver(entries => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                onResize({ width, height, entry });
            }
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, [element, onResize]);
} 