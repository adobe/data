// © 2026 Adobe. MIT License. See /LICENSE for details.

export type Filter = "all" | "active" | "completed";

/** Which todos the list shows: all, those not done, or those done. */
export const filter = Symbol();

declare module "@adobe/ecs" {
    interface Resources {
        [filter]: { type: Filter; default: "all" };
    }
}

