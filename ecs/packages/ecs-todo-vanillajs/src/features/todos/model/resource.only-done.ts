// © 2026 Adobe. MIT License. See /LICENSE for details.

/** Which todos the list shows: those whose `done` is this, or every todo for null. */
export const onlyDone = Symbol();

declare module "@adobe/ecs" {
    interface Resources {
        [onlyDone]: { type: boolean | null; default: null; thread: "main" };
    }
}
