// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect, it } from "vitest";
import { System, workers, World } from "@adobe/ecs";
import { filter, setFilter } from "./index.js";
import type { Filter } from "./internal/type.filter.js";

let seen: Filter | null = null;
const readFilter = System.create({ readonly: true }, ({ resources }) => {
    seen = resources[filter];
});

it("shows every todo until a filter is set", async () => {
    await using world = World.create({ [workers]: 0 });
    await world.run(readFilter);
    expect(seen).toBe("all");
    await world.run(setFilter, { filter: "completed" });
    await world.run(readFilter);
    expect(seen).toBe("completed");
});
