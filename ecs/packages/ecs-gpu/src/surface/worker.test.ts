// © 2026 Adobe. MIT License. See /LICENSE for details.
import { World } from "@adobe/ecs";
import { describe, expect, it } from "vitest";
import { gpu } from "../gpu.test-helper.js";
import { configured, sizeOf } from "../test-systems.test-helper.js";
import * as Surface from "./public.js";

describe("a surface of a world on a worker", () => {
    it.runIf(gpu)("presents the page's canvas there, sized as the canvas is on the page", async () => {
        const worker = new Worker(new URL("./world.test-worker.ts", import.meta.url), { type: "module" });
        const channel = new MessageChannel();
        worker.postMessage({ port: channel.port1 }, [channel.port1]);
        const joined = await World.join(channel.port2);
        const canvas = document.createElement("canvas");
        canvas.style.width = "30px";
        canvas.style.height = "20px";
        document.body.append(canvas);
        const surface = await joined.run(Surface.attach, { canvas: canvas.transferControlToOffscreen(), width: 1, height: 1 });
        const stop = Surface.observe(canvas, joined, surface);
        const pixels = (css: number): number => Math.round(css * devicePixelRatio);
        await expect.poll(() => joined.run(sizeOf, { target: surface })).toEqual([pixels(30), pixels(20)]);
        await expect.poll(() => joined.run(configured, { surface })).toBe(true);
        stop();
        await joined.dispose();
        worker.terminate();
        canvas.remove();
    });
});
