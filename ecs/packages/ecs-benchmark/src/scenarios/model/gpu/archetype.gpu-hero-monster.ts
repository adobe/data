// © 2026 Adobe. MIT License. See /LICENSE for details.
import { damage } from "../shared/component.damage.js";
import { health } from "../shared/component.health.js";
import { player } from "../shared/component.player.js";
import { position } from "../shared/component.position.js";
import { sprite } from "../shared/component.sprite.js";
import { velocity } from "../shared/component.velocity.js";
import { gpuData } from "./component.gpu-data.js";

/** `HeroMonster` with the GPU lane's data. */
export const GpuHeroMonster = [position, velocity, gpuData, player, health, damage, sprite] as const;
