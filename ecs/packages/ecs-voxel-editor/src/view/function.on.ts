// © 2026 Adobe. MIT License. See /LICENSE for details.

/** Listens for one event type on `root` until the returned function is called. */
export const on = <K extends keyof HTMLElementEventMap>(root: HTMLElement, type: K, listener: (event: HTMLElementEventMap[K]) => void): (() => void) => {
    root.addEventListener(type, listener);
    return () => root.removeEventListener(type, listener);
};
