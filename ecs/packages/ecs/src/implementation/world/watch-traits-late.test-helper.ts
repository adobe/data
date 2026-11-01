// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "../../interface/system/system.js";
import { inDocument } from "./watch-traits.test-helper.js";

/** A resource of the document's, registered once this module is imported. */
export const margin = Symbol("watchTraits/margin");

declare module "@adobe/ecs" {
    export interface Resources {
        [margin]: { type: number; [inDocument]: true };
    }
}

export const widen = System.create(({ resources }) => { resources[margin] = 5; });
