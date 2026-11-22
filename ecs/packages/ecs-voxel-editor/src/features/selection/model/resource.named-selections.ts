// © 2026 Adobe. MIT License. See /LICENSE for details.

/** The main model's selections saved by name, each face's cell and side, which its file keeps; replaced as they change. */
export const namedSelections = Symbol();

declare module "@adobe/ecs" {
    interface Resources {
        [namedSelections]: { type: ReadonlyMap<string, readonly (readonly [number, number, number, number])[]> | null; thread: "main" };
    }
}
