// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System, World, workers } from "@adobe/ecs";
import { describe, expect, it } from "vitest";
import { gpuData } from "./gpu/component.gpu-data.js";
import { defaultGpuData } from "./gpu/constant.default-gpu-data.js";
import { position } from "./shared/component.position.js";
import { clearEntities } from "./system.clear-entities.js";

describe("clearEntities", () => {
    it("despawns entities that hold only the GPU lane's data, as those holding the suite's components", async () => {
        const world = World.create({ [workers]: 0 });
        await world.run(System.create({}, ({ commands }) => {
            commands.spawn([gpuData])({ [gpuData]: defaultGpuData });
            commands.spawn([position])({ [position]: { x: 0, y: 0 } });
        }));
        await world.run(clearEntities);
        let left = 0;
        for (const component of [gpuData, position] as const) await world.run(System.create({ readonly: true, components: { with: [component] } }, () => { left++; }));
        expect(left).toBe(0);
        await world.dispose();
    });
});
