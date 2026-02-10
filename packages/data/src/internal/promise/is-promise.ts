// © 2026 Adobe. MIT License. See /LICENSE for details.

export function isPromise<T = unknown>(obj: unknown): obj is Promise<T> {
    const maybePromise = obj as Partial<Promise<T>> | undefined;
    return (
        !!maybePromise && (typeof maybePromise === 'object' || typeof maybePromise === 'function') && typeof maybePromise?.then === 'function'
    );
}
