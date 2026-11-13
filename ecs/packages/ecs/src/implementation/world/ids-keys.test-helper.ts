// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "../../interface/system/system.js";
import { Component } from "../../interface/component/component.js";
import { changes } from "./ids-changes.test-helper.js";

// A module of keys, a derivation and a changes system, which `ids.test.ts` evaluates again: each evaluation makes new symbols and
// values under the same ids.
export const score = Symbol("score");
export const shown = Symbol("shown");

declare module "@adobe/ecs" {
    export interface Components {
        [score]: { type: number };
        [shown]: { type: true; derived: true };
    }
}

Component.derive(shown, { from: [score] });
export const recording = System.changes({ watch: [score] }, ({ groups }) => {
    for (const group of groups) changes.push(group.added);
});
