// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { U32 } from "@adobe/ecs";

/**
 * A voxel's paint as the GPU finds it: its paint's slot in the material table, shifted up 6 bits, over the faces it
 * shows on, a bit for each side as `paintedFaces` keeps them, none outside paint mode.
 */
export const paintSlot = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [paintSlot]: { type: U32 };
    }
}
