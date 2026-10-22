import { afterEach, expect, it, vi } from "vitest";
import { System, World, workers } from "../../../index.js";
import { logFailures } from "./log-failures.js";

const fails = System.create({ name: "test/fails" }, () => {
    throw new Error("broken");
});
const failsObserving = System.create({ name: "test/failsObserving", observer: true }, () => {
    throw new Error("observer broken");
});
const nothing = System.create({ name: "test/nothing" }, () => {});

afterEach(() => {
    vi.restoreAllMocks();
});

it("logs a run's failures once each, and an observer pass's at the next pass", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await using world = World.create({ [workers]: 0 });
    world.add(logFailures);
    await world.run(fails);
    expect(error).toHaveBeenCalledWith("A run failed", [expect.objectContaining({ kind: "system", message: "broken" })]);
    world.add(failsObserving);
    await world.run(nothing);
    world.remove(failsObserving);
    await world.run(nothing);
    expect(error.mock.calls.map(([, failures]) => Array.isArray(failures) ? failures.map(failure => failure.message) : [])).toEqual([["broken"], ["observer broken"]]);
});
