import { describe, expect, it } from "vitest";
import { strataOf, type RuleFacts } from "../../types/registry/strata.js";
import { closedComponents } from "./closure.js";

// Components 0 to 9: 0 mesh, 1 transform, 2 hidden, 3 slot (derived), 4 ready (within slot), 5 visible (derived), 6 resident (derived), 7 sprite.
const derived = [false, false, false, true, false, true, true, false];
const hosts = [-1, -1, -1, -1, 3, -1, -1, -1];
const name = (id: number): string => `c${id}`;
const rule = (has: number[], not: number[], derives: number[]): RuleFacts => ({ name: "r", has, not, derives });
const closure = (rules: readonly RuleFacts[], components: number[]): number[] => closedComponents(components, derived, hosts, strataOf(rules, hosts, name));

describe("closure", () => {
    const slots = rule([0, 1], [2], [3]);
    it("derives where a rule matches, and drops what no rule derives", () => {
        expect(closure([slots], [0, 1])).toEqual([0, 1, 3]);
        expect(closure([slots], [0, 1, 2, 3])).toEqual([0, 1, 2]);
        expect(closure([slots], [0, 3])).toEqual([0]);
    });
    it("keeps a component within its host only while the host is present", () => {
        expect(closure([slots], [0, 1, 3, 4])).toEqual([0, 1, 3, 4]);
        expect(closure([slots], [0, 1, 2, 3, 4])).toEqual([0, 1, 2]);
    });
    it("chains rules and unions owners, after the strata their negations read", () => {
        const visible = rule([3], [], [5]);
        const fromSprite = rule([7], [], [5]);
        const resident = rule([5], [4], [6]);
        expect(closure([slots, visible, fromSprite, resident], [0, 1])).toEqual([0, 1, 3, 5, 6]);
        expect(closure([slots, visible, fromSprite, resident], [0, 1, 4])).toEqual([0, 1, 3, 4, 5]);
        expect(closure([slots, visible, fromSprite, resident], [7])).toEqual([5, 6, 7]);
    });
    it("is a least fixed point: positive cycles derive nothing on their own", () => {
        expect(closure([rule([5], [], [6]), rule([6], [], [5])], [0])).toEqual([0]);
        expect(closure([rule([5], [], [6]), rule([6], [], [5]), rule([0], [], [5])], [0])).toEqual([0, 5, 6]);
    });
    it("rejects cycles through a negation or within", () => {
        expect(() => strataOf([rule([], [6], [5]), rule([5], [], [6])], hosts, name)).toThrow("cycle through a negation, which could oscillate: c5, c6");
        expect(() => strataOf([rule([4], [], [3])], hosts, name)).toThrow("within each other in a cycle: c3, c4");
    });
});
