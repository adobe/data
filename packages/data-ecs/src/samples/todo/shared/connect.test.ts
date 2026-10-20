import { afterEach, expect, it, vi } from "vitest";
import { System, workers } from "../../../index.js";
import { createWorld } from "../../../implementation/index.js";
import { reported } from "./connect.js";

const fails = System.create({ name: "test/fails" }, () => {
    throw new Error("broken");
});
const nothing = System.create({ name: "test/nothing" }, () => {});

afterEach(() => {
    vi.restoreAllMocks();
});

it("logs a run's failures", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await using world = createWorld({ [workers]: 0 });
    await reported(world.run(fails));
    expect(error).toHaveBeenCalledWith("A run failed", [expect.objectContaining({ kind: "system", message: "broken" })]);
});

it("logs a rejected run instead of rejecting", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const world = createWorld({ [workers]: 0 });
    await world.dispose();
    await expect(reported(world.run(nothing))).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith("A run was rejected", expect.any(Error));
});
