// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * The user's favorites, by key: `material:<name>`, `model:<name>` or `file:<path>`; kept as the user's own settings,
 * not in any document. Null until they're read.
 */
export const favorites = Symbol();

declare module "@adobe/ecs" {
    interface Resources {
        [favorites]: { type: ReadonlySet<string> | null; thread: "main" };
    }
}
