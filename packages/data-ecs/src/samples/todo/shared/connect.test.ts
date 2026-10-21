import { afterEach, expect, it, vi } from "vitest";
import { System, workers } from "../../../index.js";
import { createWorld } from "../../../implementation/index.js";
import { reported } from "./connect.js";

const nothing = System.create({ name: "test/nothing" }, () => {});

afterEach(() => {
    vi.restoreAllMocks();
});

it("logs a rejected run instead of rejecting", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const world = createWorld({ [workers]: 0 });
    await world.dispose();
    await expect(reported(world.run(nothing))).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith("A run was rejected", expect.any(Error));
});
