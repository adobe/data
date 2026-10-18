import { afterEach, describe, expect, it, vi } from "vitest";
import { Component } from "../../interface/component/component.js";
import { threadClaims, threadStatus } from "../../interface/components/index.js";
import { System } from "../../interface/system/system.js";
import { workers } from "../../interface/resources/workers.js";
import { createWorld, join } from "./create.js";

const value = Symbol("shareTest/value");
declare module "@adobe/data-ecs" {
    export interface Components {
        [value]: typeof valueTraits;
    }
}
const valueTraits = Component.register(value, { type: { type: "number" } });

/** Runs a body alone as an untyped caller would, bypassing the types' checks. */
const untypedBody = (body: (context: { readonly commands: { readonly [name: string]: (...parameters: unknown[]) => unknown } }) => void): System<void> => Reflect.apply(System.create, undefined, [body]);

afterEach(() => { vi.unstubAllGlobals(); });

describe("world.share", () => {
    it("rejects commands that add, remove or spawn what only the world writes, for untyped callers", async () => {
        const world = createWorld({ [workers]: 0 });
        const spawned = await world.run(untypedBody(({ commands }) => { commands.spawn([value, threadStatus]); }));
        expect(spawned.failures.map(failure => failure.message)).toEqual(['"threadStatus" is written only by the world.']);
        const added = await world.run(untypedBody(({ commands }) => { commands.add(1, threadClaims, []); }));
        expect(added.failures.map(failure => failure.message)).toEqual(['"threadClaims" is written only by the world.']);
        const removed = await world.run(untypedBody(({ commands }) => { commands.remove(1, [threadStatus]); }));
        expect(removed.failures.map(failure => failure.message)).toEqual(['"threadStatus" is written only by the world.']);
        await world.dispose();
    });
    it("throws for a world and a join without cross-origin isolation, where memory can't be shared", async () => {
        vi.stubGlobal("crossOriginIsolated", false);
        const world = createWorld({ [workers]: 0 });
        const { port1, port2 } = new MessageChannel();
        expect(() => world.share(port1)).toThrow("Without cross-origin isolation memory can't be shared, so no thread can join.");
        expect(() => join(port2)).toThrow("Without cross-origin isolation memory can't be shared, so no thread can join.");
        port1.close();
        await world.dispose();
    });
});
