// © 2026 Adobe. MIT License. See /LICENSE for details.
import { addHeroMonster } from "./internal/function.add-hero-monster.js";
import { create } from "./internal/function.create.js";
import type { Reference } from "./type.reference.js";

/** `BM_SystemsUpdate`'s entities. */
export const updateEntities = (count: number, seedOf: (i: number) => number): Reference[] =>
    Array.from({ length: count }, (_, i) => {
        const entity = create();
        addHeroMonster(entity, seedOf(i), null);
        return entity;
    });
