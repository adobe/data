// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect, it } from "vitest";
import { System, workers, World } from "../../../../index.js";
import { filter, type Filter } from "./data.js";
import { setFilter } from "./model.js";

let seen: Filter | null = null;
const readFilter = System.create({ observer: true, resources: { read: [filter] } }, ({ resources }) => {
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
