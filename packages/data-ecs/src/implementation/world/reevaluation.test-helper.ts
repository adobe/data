import { Component, System } from "../../index.js";

// A module the identity example evaluates twice, as a dev server does after an edit.
export const score = Symbol("reevaluation/score");

declare module "@adobe/data-ecs" {
    interface Components {
        [score]: { type: number };
    }
}

Component.register(score, { type: { type: "number" } });

export const bump = System.create({ name: "reevaluation/bump", components: { write: [score] } }, row => {
    row[score] += 1;
});
