// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Copy text to the clipboard, fire-and-forget. A pure UI affordance — not
 * application state — so it lives as a plain utility a container passes
 * straight to its presentation, never as a database transaction or action.
 */
export const copyText = (text: string): void => {
    void navigator.clipboard.writeText(text).catch(() => undefined);
};
