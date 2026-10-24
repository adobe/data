// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "../../index.js";

// A module the identity example evaluates twice, as a dev server does after an edit.
export const score = Symbol("reevaluation/score");

declare module "@adobe/ecs" {
    interface Components {
        [score]: { type: number };
    }
}


export const bump = System.create({ components: { write: [score] } }, row => {
    row[score] += 1;
});
