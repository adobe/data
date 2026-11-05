// © 2026 Adobe. MIT License. See /LICENSE for details.

/** Where a view's camera looks from. */
export const camera = Symbol();

declare module '@adobe/ecs' {
    interface Components {
        [camera]: { type: "orbit" | "side" | "above" };
    }
}
