// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Finalizer } from "../../interface/finalizer/finalizer.js";
import { Rule } from "../../interface/rule/rule.js";
import { changes } from "./ids-changes.test-helper.js";

// A module of keys, a rule and a finalizer, which `ids.test.ts` evaluates again: each evaluation makes new symbols and
// values under the same ids.
export const score = Symbol("score");
export const shown = Symbol("shown");

declare module "@adobe/ecs" {
    export interface Components {
        [score]: { type: number };
        [shown]: { type: true; derived: true };
    }
}

export const showing = Rule.create({ components: { with: [score] }, derive: [shown] });
export const recording = Finalizer.changes({ watch: [score] }, ({ groups }) => {
    for (const group of groups) changes.push(group.added);
});
