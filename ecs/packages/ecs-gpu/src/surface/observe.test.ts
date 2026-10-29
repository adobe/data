// © 2026 Adobe. MIT License. See /LICENSE for details.
import { World, workers } from "@adobe/ecs";
import { describe, expect, it } from "vitest";
import { sizeOf } from "../test-systems.test-helper.js";
import * as Surface from "./public.js";

describe("observing a canvas on the page", () => {
    it("keeps its surface's size the canvas's size in device pixels", async () => {
        await using world = World.create({ [workers]: 0 });
        const canvas = document.createElement("canvas");
        canvas.style.width = "30px";
        canvas.style.height = "20px";
        document.body.append(canvas);
        const surface = await world.run(Surface.attach, { canvas: canvas.transferControlToOffscreen(), width: 1, height: 1 });
        const stop = Surface.observe(canvas, world, surface);
        const pixels = (css: number): number => Math.round(css * devicePixelRatio);
        await expect.poll(() => world.run(sizeOf, { target: surface })).toEqual([pixels(30), pixels(20)]);
        canvas.style.width = "40px";
        await expect.poll(() => world.run(sizeOf, { target: surface })).toEqual([pixels(40), pixels(20)]);
        stop();
        canvas.style.width = "50px";
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        expect(await world.run(sizeOf, { target: surface })).toEqual([pixels(40), pixels(20)]);
        canvas.remove();
    });
});
