// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { MenuButton } from "../../../../elements/index.js";

/** The page's file menu; null until the page provides it. */
export const fileMenu = Symbol();

declare module "@adobe/ecs" {
    interface Resources {
        [fileMenu]: { type: MenuButton | null; thread: "main" };
    }
}
