import { afterEach, describe, expect, it, vi } from "vitest";
import { workers } from "../../interface/resources/workers.js";
import { createWorld, join } from "./create.js";

afterEach(() => { vi.unstubAllGlobals(); });

describe("world.share", () => {
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
