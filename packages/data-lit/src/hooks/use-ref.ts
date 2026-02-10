// © 2026 Adobe. MIT License. See /LICENSE for details.

import { useState } from "./use-state.js";

export function useRef<T>(initialValue: T): { current: T } {
    const [state] = useState({ current: initialValue });
    return state;
}
