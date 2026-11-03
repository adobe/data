// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Plugin, System, World, workers } from "./index.js";

declare module "@adobe/ecs" {
    interface PluginConfig {
        pluginTestName: string;
        pluginTestCount: number;
        pluginTestNote?: string;
    }
}

const idle = System.create(() => {});

/** A plugin whose readonly system logs `label` after each run, and whose connection logs starting and stopping. */
const logged = (log: string[], label: string): Plugin<"pluginTestName"> => ({
    systems: [System.create({ readonly: true }, () => void log.push(`${label} ran`))],
    connect: (_, { pluginTestName }) => {
        log.push(`${label} connects ${pluginTestName}`);
        return () => log.push(`${label} disconnects`);
    },
});

describe("Plugin.start", () => {
    it("adds every plugin's systems, connects each in order and, disposed, disconnects in reverse and removes the systems", async () => {
        await using world = World.create({ [workers]: 0 });
        const log: string[] = [];
        const started = Plugin.start(world, [logged(log, "a"), logged(log, "b")], { pluginTestName: "x" });
        expect(log).toEqual(["a connects x", "b connects x"]);
        await world.run(idle);
        expect(log.slice(2).sort()).toEqual(["a ran", "b ran"]);
        log.length = 0;
        started[Symbol.dispose]();
        expect(log).toEqual(["b disconnects", "a disconnects"]);
        await world.run(idle);
        expect(log).toEqual(["b disconnects", "a disconnects"]);
    });

    it("does nothing when disposed again", async () => {
        await using world = World.create({ [workers]: 0 });
        const log: string[] = [];
        const started = Plugin.start(world, [logged(log, "a")], { pluginTestName: "x" });
        started[Symbol.dispose]();
        started[Symbol.dispose]();
        expect(log).toEqual(["a connects x", "a disconnects"]);
    });

    it("disconnects the plugins connected and removes the systems when a connect throws, then rethrows", async () => {
        await using world = World.create({ [workers]: 0 });
        const log: string[] = [];
        const failing: Plugin = { systems: [], connect: () => { throw new Error("no canvas"); } };
        expect(() => Plugin.start(world, [logged(log, "a"), failing, logged(log, "b")], { pluginTestName: "x" })).toThrow("no canvas");
        expect(log).toEqual(["a connects x", "a disconnects"]);
        await world.run(idle);
        expect(log).toEqual(["a connects x", "a disconnects"]);
    });

    it("disconnects every plugin and removes the systems when disconnects throw, then throws what they threw", async () => {
        await using world = World.create({ [workers]: 0 });
        const log: string[] = [];
        const throwing = (label: string): Plugin => ({ systems: [], connect: () => () => { throw new Error(`${label} failed`); } });
        const one = Plugin.start(world, [logged(log, "a"), throwing("b"), logged(log, "c")], { pluginTestName: "x" });
        expect(() => one[Symbol.dispose]()).toThrow("b failed");
        expect(log.slice(2)).toEqual(["c disconnects", "a disconnects"]);
        const two = Plugin.start(world, [throwing("d"), throwing("e")], {});
        let thrown: unknown;
        try { two[Symbol.dispose](); } catch (error) { thrown = error; }
        expect(thrown instanceof AggregateError ? thrown.errors.map(error => String(error)) : thrown).toEqual(["Error: e failed", "Error: d failed"]);
        log.length = 0;
        await world.run(idle);
        expect(log).toEqual([]);
    });

    it("rethrows what connect threw when disconnecting the plugins connected before it throws too", async () => {
        await using world = World.create({ [workers]: 0 });
        const log: string[] = [];
        const disconnectFails: Plugin = { systems: [], connect: () => () => { throw new Error("disconnect failed"); } };
        const connectFails: Plugin = { systems: [], connect: () => { throw new Error("connect failed"); } };
        let thrown: unknown;
        try { Plugin.start(world, [logged(log, "a"), disconnectFails, connectFails], { pluginTestName: "x" }); } catch (error) { thrown = error; }
        expect(thrown instanceof AggregateError ? thrown.errors.map(error => String(error)) : thrown).toEqual(["Error: connect failed", "Error: disconnect failed"]);
        expect(log).toEqual(["a connects x", "a disconnects"]);
        await world.run(idle);
        expect(log).toEqual(["a connects x", "a disconnects"]);
    });

    it("starts plugins without systems or connections, with an empty config", async () => {
        await using world = World.create({ [workers]: 0 });
        using _started = Plugin.start(world, [{ systems: [] }, { systems: [idle] }], {});
        await world.run(idle);
    });
});
