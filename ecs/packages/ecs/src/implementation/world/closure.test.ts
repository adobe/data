// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { strataOf, type DerivationFacts } from "../../interface/registry/strata.js";
import { closedComponents } from "./closure.js";

// Components 0 to 9: 0 mesh, 1 transform, 2 hidden, 3 slot (derived), 4 ready (within slot), 5 visible (derived), 6 resident (derived), 7 sprite.
const derived = [false, false, false, true, false, true, true, false];
const hosts = [-1, -1, -1, -1, 3, -1, -1, -1];
const name = (id: number): string => `c${id}`;
const derivation = (has: number[], not: number[], derives: number[]): DerivationFacts => ({ has, not, derives });
const closure = (derivations: readonly DerivationFacts[], components: number[]): number[] => closedComponents(components, derived, hosts, strataOf(derivations, hosts, name));

describe("closure", () => {
    const slots = derivation([0, 1], [2], [3]);
    it("derives where a derivation matches, and drops what no derivation derives", () => {
        expect(closure([slots], [0, 1])).toEqual([0, 1, 3]);
        expect(closure([slots], [0, 1, 2, 3])).toEqual([0, 1, 2]);
        expect(closure([slots], [0, 3])).toEqual([0]);
    });
    it("keeps a component within its host only while the host is present", () => {
        expect(closure([slots], [0, 1, 3, 4])).toEqual([0, 1, 3, 4]);
        expect(closure([slots], [0, 1, 2, 3, 4])).toEqual([0, 1, 2]);
    });
    it("chains derivations and unions owners, after the strata their negations read", () => {
        const visible = derivation([3], [], [5]);
        const fromSprite = derivation([7], [], [5]);
        const resident = derivation([5], [4], [6]);
        expect(closure([slots, visible, fromSprite, resident], [0, 1])).toEqual([0, 1, 3, 5, 6]);
        expect(closure([slots, visible, fromSprite, resident], [0, 1, 4])).toEqual([0, 1, 3, 4, 5]);
        expect(closure([slots, visible, fromSprite, resident], [7])).toEqual([5, 6, 7]);
    });
    it("is a least fixed point: positive cycles derive nothing on their own", () => {
        expect(closure([derivation([5], [], [6]), derivation([6], [], [5])], [0])).toEqual([0]);
        expect(closure([derivation([5], [], [6]), derivation([6], [], [5]), derivation([0], [], [5])], [0])).toEqual([0, 5, 6]);
    });
    it("rejects cycles through a negation or within", () => {
        expect(() => strataOf([derivation([], [6], [5]), derivation([5], [], [6])], hosts, name)).toThrow("cycle through a negation, which could oscillate: c5, c6");
        expect(() => strataOf([derivation([4], [], [3])], hosts, name)).toThrow("within each other in a cycle: c3, c4");
    });
});
