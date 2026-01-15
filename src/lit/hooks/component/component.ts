// © 2026 Adobe. MIT License. See /LICENSE for details.

export interface Component extends EventTarget {
    /**
     * Is this component active and connected to the containing dom?
     */
    readonly isConnected: boolean;
    hookIndex: number
    hooks: any[]
    updatedListeners: Set<() => void>
    requestUpdate(): void
}