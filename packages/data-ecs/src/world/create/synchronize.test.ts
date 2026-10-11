import { describe, expect, it } from "vitest";
import { indexOf, reserve } from "./entities.js";
import { createState } from "./state.js";
import { synchronize } from "./synchronize.js";

describe("synchronize", () => {
    it("releases a reserved index whose spawn never arrived, so it isn't lost", () => {
        const state = createState();
        const orphan = reserve(state.entities);
        synchronize(state);
        const next = reserve(state.entities);
        expect(indexOf(next)).toBe(indexOf(orphan));
        expect(next).not.toBe(orphan);
    });
});
