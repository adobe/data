// © 2026 Adobe. MIT License. See /LICENSE for details.

import { useEffect } from "./use-effect.js";
import { useState } from "./use-state.js";

/**
 * Hook to debounce a value. Returns the debounced value after the specified delay.
 * 
 * @param value - The value to debounce
 * @param delay - Delay in milliseconds before updating the debounced value
 * @returns The debounced value
 */
export function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState(value);

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        return () => clearTimeout(timeoutId);
    }, [value, delay]);

    return debouncedValue;
}

