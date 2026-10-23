// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Archetype } from '../../interface/archetype/archetype.js';

/** Keys and lists another module's kernels import, in `imported-lists.test.ts`. */

export const ember = Symbol("importedListsTest/ember");
/** A key only this module's lists name to the kernels. */
const glow = Symbol("importedListsTest/glow");
export const marked = Symbol("importedListsTest/marked");
declare module "@adobe/ecs" {
    export interface Components {
        [ember]: { type: number };
        [glow]: { type: true };
        [marked]: { type: true };
    }
}

export const Spark = Archetype.create([ember, glow]);
export const Marks = [ember, marked] as const;
