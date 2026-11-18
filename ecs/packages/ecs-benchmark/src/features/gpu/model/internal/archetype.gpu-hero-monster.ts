// © 2026 Adobe. MIT License. See /LICENSE for details.
import { damage, health, player, position, sprite, velocity } from "../../../../model/index.js";
import { gpuData } from "../component.gpu-data.js";

/** `HeroMonster` with the GPU lane's data. */
export const GpuHeroMonster = [position, velocity, gpuData, player, health, damage, sprite] as const;
