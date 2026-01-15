// © 2026 Adobe. MIT License. See /LICENSE for details.

import { useEffect } from "./use-effect.js";
import { useMemo } from "./use-memo.js";

export function useWindowEvent<K extends keyof WindowEventMap>(
    event: K,
    callbackFactory: () => (e: WindowEventMap[K]) => void,
    deps: any[] = []
) {
    const callback = useMemo(callbackFactory, deps);
    useEffect(() => {
        window.addEventListener(event, callback);
        return () => window.removeEventListener(event, callback);
    }, [callback]);
}