// © 2026 Adobe. MIT License. See /LICENSE for details.
import { claimKey, kindOf } from './names.js';
import type { BuiltIn } from '../trait/key.js';

const builtIn: ReadonlySet<unknown> = new Set<BuiltIn>(["type", "derived", "within", "reference", "reduce", "thread", "transfer"]);

/** Whether `name` is a trait: a built-in one's string, or a registered trait's symbol. */
export const isTrait = (name: unknown): boolean => builtIn.has(name) || kindOf(name) === "trait";

/** Registers a trait's key; registering it again is accepted. Throws for a key that isn't a plain symbol, or one of another kind. */
export const addTrait = (key: unknown): void => {
    if (kindOf(key) !== "trait") claimKey(key, "trait");
};
