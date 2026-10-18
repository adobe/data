import { Archetype } from '../../interface/archetype/archetype.js';
import { Component } from '../../interface/component/component.js';

/** Keys and lists another module's kernels import, in `imported-lists.test.ts`. */

export const ember = Symbol("importedListsTest/ember");
/** A key only this module's lists name to the kernels. */
const glow = Symbol("importedListsTest/glow");
export const marked = Symbol("importedListsTest/marked");
declare module "@adobe/data-ecs" {
    export interface Components {
        [ember]: typeof emberTraits;
        [glow]: typeof glowTraits;
        [marked]: typeof markedTraits;
    }
}
const emberTraits = Component.register(ember, { type: { type: "number" } });
const glowTraits = Component.register(glow, { type: { const: true } });
const markedTraits = Component.register(marked, { type: { const: true } });

export const Spark = Archetype.create([ember, glow]);
export const Marks = [ember, marked] as const;
