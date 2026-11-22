// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Marks a model whose size is unlocked: editing past its bounds grows it, where a locked one, a model without this,
 * stops at them.
 */
export const sizeUnlocked = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [sizeUnlocked]: { type: true };
    }
}
