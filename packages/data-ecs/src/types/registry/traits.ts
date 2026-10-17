import { declareName } from './names.js';

const builtIn: readonly string[] = ["type", "derived", "within", "reference", "reduce", "thread", "transfer"];
const traits = new Set<string | symbol>(builtIn);
for (const name of builtIn) declareName(name, "trait");

/** Whether `name` is a registered trait. */
export const isTrait = (name: string | symbol): boolean => traits.has(name);

/** Records a trait whose name is claimed. */
export const addTrait = (name: string | symbol): void => {
    traits.add(name);
};
