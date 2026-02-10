// © 2026 Adobe. MIT License. See /LICENSE for details.

export interface Disposable {
    dispose: () => void;
}

export function isDisposable(value: unknown): value is Disposable {
    return value !== null && typeof value === "object" && "dispose" in value && typeof value.dispose === "function";
}

