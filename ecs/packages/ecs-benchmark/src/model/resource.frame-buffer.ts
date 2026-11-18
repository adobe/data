// © 2026 Adobe. MIT License. See /LICENSE for details.
/** The render system's `FrameBuffer`: a character code per cell, `frameWidth` cells a line, `frameHeight` lines. */
export const frameBuffer = Symbol();

declare module "@adobe/ecs" {
    interface Resources {
        [frameBuffer]: { type: Uint8Array; length: 76800 };
    }
}
