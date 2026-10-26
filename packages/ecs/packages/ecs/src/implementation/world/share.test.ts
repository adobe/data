// © 2026 Adobe. MIT License. See /LICENSE for details.
import { afterEach, describe, expect, it, vi } from "vitest";
import { workers } from "../../interface/resources/workers.js";
import { createWorld, join } from "./create.js";

afterEach(() => { vi.unstubAllGlobals(); });

describe("world.share", () => {
    it("rejects a share and a join without cross-origin isolation, where memory can't be shared", async () => {
        vi.stubGlobal("crossOriginIsolated", false);
        const world = createWorld({ [workers]: 0 });
        const { port1, port2 } = new MessageChannel();
        await expect(world.share(port1)).rejects.toThrow("Without cross-origin isolation memory can't be shared, so no thread can join.");
        await expect(join(port2)).rejects.toThrow("Without cross-origin isolation memory can't be shared, so no thread can join.");
        port1.close();
        await world.dispose();
    });
});
