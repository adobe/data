// © 2026 Adobe. MIT License. See /LICENSE for details.

/** Keys the helpers of `helper-commands.test-helper.ts` command, of which `helper-commands.test.ts` imports only some. */

export const tag = Symbol("helperCommandsTest/tag");
export const size = Symbol("helperCommandsTest/size");
export const color = Symbol("helperCommandsTest/color");
declare module "@adobe/ecs" {
    export interface Components {
        [tag]: { type: boolean; default: false };
        [size]: { type: number; default: 1 };
        [color]: { type: number; default: 0 };
    }
}
