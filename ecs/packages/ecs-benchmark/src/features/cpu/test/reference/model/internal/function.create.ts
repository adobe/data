// © 2026 Adobe. MIT License. See /LICENSE for details.
import { generator } from "../function.generator.js";
import { next } from "../function.next.js";
import type { Reference } from "../type.reference.js";

/** `EntityFactory::create`. */
export const create = (): Reference => ({ position: { x: 0, y: 0 }, velocity: { x: 1, y: 1 }, data: newData() });

const newData = (): NonNullable<Reference["data"]> => {
    const rng = generator(340383);
    return { thingy: 0, dingy: 0, mingy: false, seed: 340383, rng, numgy: next(rng) };
};
