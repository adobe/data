// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Finalizer } from "../../interface/finalizer/finalizer.js";
import { identify } from "../../interface/registry/ids.test-helper.js";
import { Rule } from "../../interface/rule/rule.js";

// `ids.test.ts`'s keys module, evaluated again: new symbols under the ids of its keys, which the build registers once
// a test imports it.
export const scoreAgain = Symbol("score");
export const shownAgain = Symbol("shown");

identify(scoreAgain, "worldIdsTest/keys.ts#score");
identify(shownAgain, "worldIdsTest/keys.ts#shown");

declare module "@adobe/ecs" {
    export interface Components {
        [scoreAgain]: { type: number };
        [shownAgain]: { type: true; derived: true };
    }
}

/** The module's rule and finalizer, evaluated again, the finalizer recording into `changes`. */
export const evaluateAgain = (changes: (readonly symbol[])[]): void => {
    Rule.create(identify({ name: "worldIdsTest/shown", components: { has: [scoreAgain] }, derive: [shownAgain] }, "worldIdsTest/systems.ts#shown"));
    Finalizer.changes(identify({ name: "worldIdsTest/changes", watch: [scoreAgain] }, "worldIdsTest/systems.ts#changes"), ({ groups }) => {
        for (const group of groups) changes.push(group.added);
    });
};
